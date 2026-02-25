/**
 * Generate Dashboard Data
 *
 * Fetches project data from GitHub REST & GraphQL APIs
 * and outputs docs/dashboard-data.json for the GitHub Pages dashboard.
 *
 * Usage: npx tsx scripts/generate-dashboard-data.ts
 *
 * Environment variables:
 *   GITHUB_TOKEN       - GitHub token with repo access (required)
 *   GITHUB_REPOSITORY  - owner/repo format (required)
 *   GITHUB_PROJECT_NUMBER - GitHub Projects V2 number (optional, default: "1")
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const GITHUB_PROJECT_NUMBER = parseInt(
  process.env.GITHUB_PROJECT_NUMBER || "1",
  10,
);

if (!GITHUB_TOKEN) {
  console.error(
    "Error: GITHUB_TOKEN environment variable is required.",
  );
  process.exit(1);
}

if (!GITHUB_REPOSITORY) {
  console.error(
    "Error: GITHUB_REPOSITORY environment variable is required (format: owner/repo).",
  );
  process.exit(1);
}

const [OWNER, REPO] = GITHUB_REPOSITORY.split("/");

if (!OWNER || !REPO || !/^[\w.-]+$/.test(OWNER) || !/^[\w.-]+$/.test(REPO)) {
  console.error('Error: GITHUB_REPOSITORY must be in "owner/repo" format with valid characters.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  created_at: string;
  updated_at: string;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  created_at: string;
}

interface GitHubWorkflowRun {
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
}

interface ProjectItem {
  title: string;
  status: string | null;
  priority: string | null;
}

interface DashboardData {
  generatedAt: string;
  repository: string;
  issues: {
    open: number;
    closed: number;
    byPriority: Record<string, number>;
    byState: Record<string, number>;
    byAgent: Record<string, number>;
  };
  pullRequests: {
    open: number;
    merged: number;
    closed: number;
  };
  workflows: {
    recentRuns: {
      name: string;
      status: string;
      conclusion: string | null;
      createdAt: string;
    }[];
  };
  project: {
    items: ProjectItem[];
  };
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

const REST_BASE = "https://api.github.com";

async function restGet<T>(path: string): Promise<T | null> {
  const url = `${REST_BASE}${path}`;
  console.log(`  GET ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      console.warn(`  Warning: ${res.status} ${res.statusText} for ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`  Warning: Failed to fetch ${url}:`, err);
    return null;
  }
}

/**
 * Paginate through all pages of a REST API endpoint.
 * GitHub defaults to 30 items per page; we request 100.
 */
async function restGetAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const separator = path.includes("?") ? "&" : "?";

  while (true) {
    const data = await restGet<T[]>(
      `${path}${separator}per_page=100&page=${page}`,
    );
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return results;
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  console.log("  POST https://api.github.com/graphql");
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      console.warn(`  Warning: GraphQL ${res.status} ${res.statusText}`);
      return null;
    }
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors) {
      console.warn("  Warning: GraphQL errors:", JSON.stringify(json.errors));
      return null;
    }
    return json.data ?? null;
  } catch (err) {
    console.warn("  Warning: GraphQL request failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function extractLabelsByPrefix(
  labels: { name: string }[],
  prefix: string,
): string[] {
  return labels
    .map((l) => l.name)
    .filter((n) => n.startsWith(prefix))
    .map((n) => n.slice(prefix.length));
}

function countByLabelPrefix(
  issues: GitHubIssue[],
  prefix: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    const values = extractLabelsByPrefix(issue.labels, prefix);
    for (const v of values) {
      counts[v] = (counts[v] || 0) + 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchIssues(): Promise<DashboardData["issues"]> {
  console.log("\nFetching issues...");

  const allIssues = await restGetAll<GitHubIssue>(
    `/repos/${OWNER}/${REPO}/issues?state=all`,
  );

  // GitHub REST API returns PRs in the issues endpoint; filter them out
  const issues = allIssues.filter(
    (i) => !(i as unknown as Record<string, unknown>).pull_request,
  );

  const open = issues.filter((i) => i.state === "open").length;
  const closed = issues.filter((i) => i.state === "closed").length;

  const byPriority = countByLabelPrefix(issues, "priority:");
  const byState = countByLabelPrefix(issues, "state:");
  const byAgent = countByLabelPrefix(issues, "agent:");

  console.log(`  Found ${issues.length} issues (${open} open, ${closed} closed)`);

  return { open, closed, byPriority, byState, byAgent };
}

async function fetchPullRequests(): Promise<DashboardData["pullRequests"]> {
  console.log("\nFetching pull requests...");

  const prs = await restGetAll<GitHubPullRequest>(
    `/repos/${OWNER}/${REPO}/pulls?state=all`,
  );

  const open = prs.filter((pr) => pr.state === "open").length;
  const merged = prs.filter((pr) => pr.merged_at !== null).length;
  const closed = prs.filter(
    (pr) => pr.state === "closed" && pr.merged_at === null,
  ).length;

  console.log(
    `  Found ${prs.length} PRs (${open} open, ${merged} merged, ${closed} closed)`,
  );

  return { open, merged, closed };
}

async function fetchWorkflows(): Promise<DashboardData["workflows"]> {
  console.log("\nFetching workflow runs...");

  const data = await restGet<{ workflow_runs: GitHubWorkflowRun[] }>(
    `/repos/${OWNER}/${REPO}/actions/runs?per_page=10`,
  );

  const runs = data?.workflow_runs ?? [];

  console.log(`  Found ${runs.length} recent workflow runs`);

  return {
    recentRuns: runs.map((r) => ({
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      createdAt: r.created_at,
    })),
  };
}

async function fetchProject(): Promise<DashboardData["project"]> {
  console.log("\nFetching Projects V2 data...");

  // Try both user and organization queries
  for (const ownerType of ["user", "organization"] as const) {
    const query =
      ownerType === "user"
        ? `
      query($login: String!, $projectNumber: Int!) {
        user(login: $login) {
          projectV2(number: $projectNumber) {
            title
            items(first: 100) {
              nodes {
                content {
                  ... on Issue { title }
                  ... on PullRequest { title }
                  ... on DraftIssue { title }
                }
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `
        : `
      query($login: String!, $projectNumber: Int!) {
        organization(login: $login) {
          projectV2(number: $projectNumber) {
            title
            items(first: 100) {
              nodes {
                content {
                  ... on Issue { title }
                  ... on PullRequest { title }
                  ... on DraftIssue { title }
                }
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2SingleSelectField { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = { login: OWNER, projectNumber: GITHUB_PROJECT_NUMBER };

    interface ProjectV2Response {
      [key: string]: {
        projectV2: {
          title: string;
          items: {
            nodes: {
              content: { title?: string } | null;
              fieldValues: {
                nodes: {
                  name?: string;
                  field?: { name?: string };
                }[];
              };
            }[];
          };
        } | null;
      };
    }

    const data = await graphql<ProjectV2Response>(query, variables);
    if (!data) continue;

    const ownerData = data[ownerType === "user" ? "user" : "organization"];
    const project = ownerData?.projectV2;
    if (!project) continue;

    console.log(`  Found project: ${project.title}`);

    const items: ProjectItem[] = project.items.nodes.map((node) => {
      const title = node.content?.title ?? "(no title)";
      let status: string | null = null;
      let priority: string | null = null;

      for (const fv of node.fieldValues.nodes) {
        const fieldName = fv.field?.name?.toLowerCase();
        if (fieldName === "status" && fv.name) {
          status = fv.name;
        } else if (fieldName === "priority" && fv.name) {
          priority = fv.name;
        }
      }

      return { title, status, priority };
    });

    console.log(`  Found ${items.length} project items`);
    return { items };
  }

  console.log("  No Projects V2 found (skipping)");
  return { items: [] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Generating dashboard data for ${GITHUB_REPOSITORY}...`);

  const [issues, pullRequests, workflows, project] = await Promise.all([
    fetchIssues(),
    fetchPullRequests(),
    fetchWorkflows(),
    fetchProject(),
  ]);

  const dashboardData: DashboardData = {
    generatedAt: new Date().toISOString(),
    repository: GITHUB_REPOSITORY!,
    issues,
    pullRequests,
    workflows,
    project,
  };

  // Ensure docs/ directory exists
  const fs = await import("node:fs");
  const path = await import("node:path");

  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
    console.log("\nCreated docs/ directory");
  }

  const outputPath = path.join(docsDir, "dashboard-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2) + "\n");

  console.log(`\nDashboard data written to ${outputPath}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
