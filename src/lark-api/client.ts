/**
 * High-level HTTP client for the Lark Open Platform API.
 *
 * Integrates OAuth token management, automatic token refresh with
 * mutex-style concurrency control, rate limiting, and exponential
 * backoff retry.
 */

import {
  ENDPOINTS,
  LarkApiError,
  LarkApiResponse,
  LarkAuthConfig,
  LarkAuthError,
  LarkBlock,
  LarkRegion,
  CreateBlockResponse,
  CreateDocumentResponse,
  GetBlockResponse,
} from './types.js';
import {
  buildAuthorizationUrl,
  clearTokens,
  exchangeCodeForTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  isTokenExpired,
  loadTokens,
  refreshAccessToken,
  saveTokens,
  validateState,
} from './auth.js';
import { RateLimiter, withRetry } from './rate-limiter.js';

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/** Configuration used to construct a {@link LarkClient}. */
export interface LarkClientConfig {
  region: LarkRegion;
  appId: string;
  redirectUri: string;
}

// ---------------------------------------------------------------------------
// LarkClient
// ---------------------------------------------------------------------------

/**
 * Authenticated HTTP client for the Lark DocX API.
 *
 * Usage:
 * ```ts
 * const client = new LarkClient({ region: 'larksuite', appId: '...', redirectUri: '...' });
 * await client.authenticate();
 * const doc = await client.createDocument('My Document');
 * ```
 */
export class LarkClient {
  private readonly config: LarkAuthConfig;
  private readonly apiBase: string;
  private readonly rateLimiter: RateLimiter;

  /**
   * Shared promise used to serialize concurrent token refresh attempts.
   * Only one refresh network call is in-flight at any time.
   */
  private refreshPromise: Promise<void> | null = null;

  constructor(clientConfig: LarkClientConfig) {
    this.config = {
      appId: clientConfig.appId,
      redirectUri: clientConfig.redirectUri,
      region: clientConfig.region,
    };
    this.apiBase = ENDPOINTS[clientConfig.region].api;
    this.rateLimiter = new RateLimiter();
  }

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  /**
   * Launch the OAuth 2.0 + PKCE authentication flow.
   *
   * In a Chrome extension context this opens `chrome.identity.launchWebAuthFlow`.
   */
  async authenticate(): Promise<void> {
    // SECURITY: Use `let` so the code_verifier can be overwritten after use,
    // reducing the window during which the secret resides in memory.
    let codeVerifier: string | undefined = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();
    const authUrl = buildAuthorizationUrl(this.config, codeChallenge, state);

    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });

    if (!redirectUrl) {
      codeVerifier = undefined; // SECURITY: Clear on early exit
      throw new LarkAuthError(0, 0, 'Authentication cancelled by user');
    }

    const url = new URL(redirectUrl);
    const receivedState = url.searchParams.get('state') ?? '';
    if (!validateState(state, receivedState)) {
      codeVerifier = undefined; // SECURITY: Clear on early exit
      throw new LarkAuthError(0, 0, 'State mismatch: possible CSRF attack');
    }

    const code = url.searchParams.get('code');
    if (!code) {
      codeVerifier = undefined; // SECURITY: Clear on early exit
      throw new LarkAuthError(0, 0, 'No authorization code in redirect URL');
    }

    try {
      const tokens = await exchangeCodeForTokens(this.config, code, codeVerifier);
      await saveTokens(tokens);
    } finally {
      // SECURITY: Overwrite the PKCE code_verifier immediately after the token
      // exchange completes (or fails). JavaScript strings are immutable, so we
      // cannot scrub the original buffer, but nullifying the reference allows
      // the GC to collect it sooner and prevents accidental reuse.
      codeVerifier = undefined;
    }
  }

  /**
   * Check whether valid (non-expired) tokens are available.
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await loadTokens();
    if (!tokens) return false;
    return !isTokenExpired(tokens);
  }

  /**
   * Remove all stored tokens and sign out.
   */
  async logout(): Promise<void> {
    await clearTokens();
  }

  // -----------------------------------------------------------------------
  // Generic request
  // -----------------------------------------------------------------------

  /**
   * Make an authenticated API request.
   *
   * - Automatically attaches the `Authorization` header.
   * - Refreshes the access token on 401 (with mutex to avoid races).
   * - Applies rate limiting and retry with exponential backoff.
   *
   * @param method HTTP method.
   * @param path   API path relative to the region base (e.g. `/docx/v1/documents`).
   * @param body   Optional JSON body.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<LarkApiResponse<T>> {
    const execute = async (): Promise<LarkApiResponse<T>> => {
      await this.rateLimiter.acquire();
      const token = await this.ensureValidToken();
      const url = `${this.apiBase}${path}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401) {
        // Token may have been revoked server-side; force a refresh.
        await this.forceRefresh();
        // Retry once with fresh token.
        const freshToken = await this.ensureValidToken();
        const retryResponse = await fetch(url, {
          method,
          headers: { ...headers, Authorization: `Bearer ${freshToken}` },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return this.parseResponse<T>(retryResponse);
      }

      return this.parseResponse<T>(response);
    };

    return withRetry(execute, (error) => {
      if (error instanceof LarkApiError) return error.httpStatus;
      return undefined;
    });
  }

  // -----------------------------------------------------------------------
  // Convenience methods
  // -----------------------------------------------------------------------

  /**
   * Create a new Lark DocX document.
   *
   * @param title    Document title.
   * @param folderId Optional folder token to place the document in.
   */
  async createDocument(
    title: string,
    folderId?: string,
  ): Promise<LarkApiResponse<CreateDocumentResponse>> {
    const body: Record<string, unknown> = { title };
    if (folderId) body.folder_token = folderId;
    return this.request<CreateDocumentResponse>('POST', '/docx/v1/documents', body);
  }

  /**
   * Append child blocks to an existing block (usually the page root).
   *
   * @param docId         Document ID.
   * @param parentBlockId Parent block ID (often the document ID for root).
   * @param blocks        Array of block definitions.
   */
  async createBlocks(
    docId: string,
    parentBlockId: string,
    blocks: LarkBlock[],
  ): Promise<LarkApiResponse<CreateBlockResponse>> {
    return this.request<CreateBlockResponse>(
      'POST',
      `/docx/v1/documents/${encodeURIComponent(docId)}/blocks/${encodeURIComponent(parentBlockId)}/children`,
      { children: blocks },
    );
  }

  /**
   * Retrieve a single block by ID.
   */
  async getBlock(
    docId: string,
    blockId: string,
  ): Promise<LarkApiResponse<GetBlockResponse>> {
    return this.request<GetBlockResponse>(
      'GET',
      `/docx/v1/documents/${encodeURIComponent(docId)}/blocks/${encodeURIComponent(blockId)}`,
    );
  }

  // -----------------------------------------------------------------------
  // Token management (private)
  // -----------------------------------------------------------------------

  /**
   * Return a valid access token, refreshing if necessary.
   * Concurrent callers share the same refresh promise (mutex pattern).
   */
  private async ensureValidToken(): Promise<string> {
    const tokens = await loadTokens();
    if (!tokens) {
      throw new LarkAuthError(401, 0, 'Not authenticated');
    }

    if (!isTokenExpired(tokens)) {
      return tokens.accessToken;
    }

    // Token is expired; trigger a refresh if one is not already in progress.
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;

    const refreshed = await loadTokens();
    if (!refreshed) {
      throw new LarkAuthError(401, 0, 'Token refresh failed');
    }
    return refreshed.accessToken;
  }

  /**
   * Force a token refresh (e.g. after a server-side 401).
   */
  private async forceRefresh(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    await this.refreshPromise;
  }

  /**
   * Perform the actual token refresh network call.
   */
  private async doRefresh(): Promise<void> {
    const tokens = await loadTokens();
    if (!tokens) {
      throw new LarkAuthError(401, 0, 'No tokens available for refresh');
    }
    const newTokens = await refreshAccessToken(this.config, tokens.refreshToken);
    await saveTokens(newTokens);
  }

  /**
   * Parse a fetch `Response` into a typed {@link LarkApiResponse}, throwing
   * appropriate error subclasses for non-success status codes.
   */
  private async parseResponse<T>(response: Response): Promise<LarkApiResponse<T>> {
    const json = (await response.json()) as LarkApiResponse<T>;

    if (!response.ok) {
      throw new LarkApiError(
        response.status,
        json.code ?? 0,
        json.msg ?? response.statusText,
      );
    }

    if (json.code !== 0) {
      throw new LarkApiError(response.status, json.code, json.msg);
    }

    return json;
  }
}
