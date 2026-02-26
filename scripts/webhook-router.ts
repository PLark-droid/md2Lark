/**
 * Webhook Event Router
 *
 * Routes GitHub webhook events to appropriate handlers.
 * Called from GitHub Actions workflows to process issue, PR, push,
 * and comment events with automatic label management.
 *
 * Usage:
 *   npx tsx scripts/webhook-router.ts issue <event_type> <issue_number>
 *   npx tsx scripts/webhook-router.ts pr <event_type> <pr_number>
 *   npx tsx scripts/webhook-router.ts push <branch_name> <commit_sha>
 *   npx tsx scripts/webhook-router.ts comment <issue_number> <comment_author>
 *
 * Environment variables:
 *   GITHUB_TOKEN      - GitHub token with repo access (required)
 *   GITHUB_REPOSITORY - owner/repo format (required)
 *   COMMENT_BODY      - Comment body text (used for comment events)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventKind = 'issue' | 'pr' | 'push' | 'comment';

interface IssueArgs {
  kind: 'issue';
  eventType: string;
  issueNumber: number;
}

interface PrArgs {
  kind: 'pr';
  eventType: string;
  prNumber: number;
}

interface PushArgs {
  kind: 'push';
  branchName: string;
  commitSha: string;
}

interface CommentArgs {
  kind: 'comment';
  issueNumber: number;
  commentAuthor: string;
}

type ParsedArgs = IssueArgs | PrArgs | PushArgs | CommentArgs;

interface GitHubLabel {
  name: string;
}

interface GitHubPullRequest {
  merged: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const COMMENT_BODY = process.env.COMMENT_BODY ?? '';

const REST_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// State label mappings
// ---------------------------------------------------------------------------

/** Maps issue event actions to the state label that should be applied. */
const ISSUE_STATE_MAP: Record<string, string> = {
  opened: 'state:pending',
  closed: 'state:done',
  reopened: 'state:implementing',
};

/** Maps PR event actions to the state label that should be applied. */
const PR_STATE_MAP: Record<string, string> = {
  opened: 'state:reviewing',
};

// PR closed events require checking whether the PR was merged,
// so they are handled separately in the PR handler.

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): ParsedArgs {
  // argv[0] = node, argv[1] = script path, argv[2+] = user args
  const args = argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: webhook-router.ts <issue|pr|push|comment> <arg1> <arg2>');
    process.exit(1);
  }

  const kind = args[0] as EventKind;

  switch (kind) {
    case 'issue': {
      const eventType = args[1] ?? 'unknown';
      const issueNumber = parseInt(args[2] ?? '0', 10);
      if (isNaN(issueNumber) || issueNumber <= 0) {
        console.error('Error: Invalid issue number:', args[2]);
        process.exit(1);
      }
      return { kind, eventType, issueNumber };
    }

    case 'pr': {
      const eventType = args[1] ?? 'unknown';
      const prNumber = parseInt(args[2] ?? '0', 10);
      if (isNaN(prNumber) || prNumber <= 0) {
        console.error('Error: Invalid PR number:', args[2]);
        process.exit(1);
      }
      return { kind, eventType, prNumber };
    }

    case 'push': {
      const branchName = args[1] ?? 'unknown';
      const commitSha = args[2] ?? 'unknown';
      return { kind, branchName, commitSha };
    }

    case 'comment': {
      const issueNumber = parseInt(args[1] ?? '0', 10);
      if (isNaN(issueNumber) || issueNumber <= 0) {
        console.error('Error: Invalid issue number:', args[1]);
        process.exit(1);
      }
      const commentAuthor = args[2] ?? 'unknown';
      return { kind, issueNumber, commentAuthor };
    }

    default:
      console.error(`Error: Unknown event kind "${args[0]}". Expected: issue, pr, push, comment`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

function getRepoPath(): string {
  if (!GITHUB_REPOSITORY) {
    throw new Error('GITHUB_REPOSITORY environment variable is required');
  }
  return GITHUB_REPOSITORY;
}

function getHeaders(): Record<string, string> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required');
  }
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Fetch the current labels on an issue or PR.
 */
async function getLabels(number: number): Promise<string[]> {
  const repo = getRepoPath();
  const url = `${REST_BASE}/repos/${repo}/issues/${number}/labels`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    console.warn(`  Warning: Failed to fetch labels (${res.status} ${res.statusText})`);
    return [];
  }

  const labels = (await res.json()) as GitHubLabel[];
  return labels.map((l) => l.name);
}

/**
 * Add a single label to an issue or PR.
 */
async function addLabel(number: number, label: string): Promise<boolean> {
  const repo = getRepoPath();
  const url = `${REST_BASE}/repos/${repo}/issues/${number}/labels`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ labels: [label] }),
  });

  if (!res.ok) {
    console.warn(`  Warning: Failed to add label "${label}" (${res.status} ${res.statusText})`);
    return false;
  }

  console.log(`  Added label: ${label}`);
  return true;
}

/**
 * Remove a single label from an issue or PR.
 * Returns true if removed, false if not found or failed.
 */
async function removeLabel(number: number, label: string): Promise<boolean> {
  const repo = getRepoPath();
  const encodedLabel = encodeURIComponent(label);
  const url = `${REST_BASE}/repos/${repo}/issues/${number}/labels/${encodedLabel}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (res.status === 404) {
    // Label was not present; that's fine
    return false;
  }

  if (!res.ok) {
    console.warn(`  Warning: Failed to remove label "${label}" (${res.status} ${res.statusText})`);
    return false;
  }

  console.log(`  Removed label: ${label}`);
  return true;
}

/**
 * Replace any existing state:* label with the given new state label.
 * Removes all other state:* labels first, then adds the new one.
 */
async function setStateLabel(number: number, newLabel: string): Promise<void> {
  const currentLabels = await getLabels(number);
  const existingStateLabels = currentLabels.filter((l) => l.startsWith('state:'));

  // Remove existing state labels that differ from the target
  for (const existing of existingStateLabels) {
    if (existing !== newLabel) {
      await removeLabel(number, existing);
    }
  }

  // Add the new state label if not already present
  if (!existingStateLabels.includes(newLabel)) {
    await addLabel(number, newLabel);
  } else {
    console.log(`  Label "${newLabel}" already present`);
  }
}

/**
 * Fetch PR details to check merged status.
 */
async function getPullRequest(prNumber: number): Promise<GitHubPullRequest | null> {
  const repo = getRepoPath();
  const url = `${REST_BASE}/repos/${repo}/pulls/${prNumber}`;

  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    console.warn(`  Warning: Failed to fetch PR #${prNumber} (${res.status} ${res.statusText})`);
    return null;
  }

  return (await res.json()) as GitHubPullRequest;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleIssueEvent(args: IssueArgs): Promise<void> {
  console.log(`[issue] Event: ${args.eventType}, Issue: #${args.issueNumber}`);

  const stateLabel = ISSUE_STATE_MAP[args.eventType];
  if (stateLabel) {
    console.log(`  Transitioning to ${stateLabel}`);
    await setStateLabel(args.issueNumber, stateLabel);
  } else {
    console.log(`  No state transition defined for action "${args.eventType}"`);
  }
}

async function handlePrEvent(args: PrArgs): Promise<void> {
  console.log(`[pr] Event: ${args.eventType}, PR: #${args.prNumber}`);

  if (args.eventType === 'closed') {
    // Need to check if the PR was merged or just closed
    const pr = await getPullRequest(args.prNumber);
    if (!pr) {
      console.warn('  Warning: Could not determine PR merge status; skipping label update');
      return;
    }

    if (pr.merged) {
      console.log('  PR was merged - transitioning to state:deploying');
      await setStateLabel(args.prNumber, 'state:deploying');
    } else {
      console.log('  PR was closed without merge - transitioning to state:done');
      await setStateLabel(args.prNumber, 'state:done');
    }
    return;
  }

  const stateLabel = PR_STATE_MAP[args.eventType];
  if (stateLabel) {
    console.log(`  Transitioning to ${stateLabel}`);
    await setStateLabel(args.prNumber, stateLabel);
  } else {
    console.log(`  No state transition defined for action "${args.eventType}"`);
  }
}

async function handlePushEvent(args: PushArgs): Promise<void> {
  console.log(`[push] Branch: ${args.branchName}, Commit: ${args.commitSha}`);
  console.log(`  Push event logged. No additional actions required.`);
}

async function handleCommentEvent(args: CommentArgs): Promise<void> {
  console.log(`[comment] Issue: #${args.issueNumber}, Author: ${args.commentAuthor}`);

  const body = COMMENT_BODY.trim();
  if (!body) {
    console.log('  Comment body is empty (COMMENT_BODY env var not set)');
    return;
  }

  // Log a preview of the comment (truncated for readability)
  const preview = body.length > 100 ? body.substring(0, 100) + '...' : body;
  console.log(`  Comment preview: ${preview}`);

  if (body.startsWith('/agent')) {
    const command = body.split('\n')[0].trim();
    console.log(`  Detected agent command: "${command}"`);
    console.log('  Agent command execution is not yet implemented; logged for future processing.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log(`\nWebhook Router - Processing ${args.kind} event`);
  console.log(`  Repository: ${GITHUB_REPOSITORY ?? '(not set)'}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('');

  // Validate required env vars for events that need API access
  if (args.kind === 'issue' || args.kind === 'pr') {
    if (!GITHUB_TOKEN) {
      console.error('Error: GITHUB_TOKEN environment variable is required for label management.');
      process.exit(1);
    }
    if (!GITHUB_REPOSITORY) {
      console.error('Error: GITHUB_REPOSITORY environment variable is required.');
      process.exit(1);
    }
  }

  switch (args.kind) {
    case 'issue':
      await handleIssueEvent(args);
      break;
    case 'pr':
      await handlePrEvent(args);
      break;
    case 'push':
      await handlePushEvent(args);
      break;
    case 'comment':
      await handleCommentEvent(args);
      break;
  }

  console.log('\nWebhook routing complete.');
}

main().catch((err) => {
  console.error('Fatal error in webhook router:', err);
  process.exit(1);
});
