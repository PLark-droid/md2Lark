/**
 * Lark OAuth 2.0 + PKCE authentication utilities.
 *
 * Pure functions (PKCE helpers, URL builders, state validation) are
 * exported separately so they can be unit-tested without a Chrome
 * extension environment.  Chrome-dependent operations (storage, identity
 * web auth flow) are isolated into dedicated functions.
 */

import {
  ENDPOINTS,
  LarkAuthConfig,
  LarkAuthError,
  LarkTokenResponse,
  LarkTokenStore,
} from './types.js';

// ---------------------------------------------------------------------------
// PKCE helpers (pure functions)
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random code verifier (Base64URL, 128 bytes).
 *
 * Uses `crypto.getRandomValues` which is available in both browser and
 * Node.js >= 19 (via globalThis.crypto).
 */
export function generateCodeVerifier(): string {
  const buffer = new Uint8Array(128);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

/**
 * Derive the PKCE code challenge from a code verifier using SHA-256.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a random state parameter for CSRF protection.
 */
export function generateState(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer);
}

/**
 * Encode a `Uint8Array` to a Base64URL string (no padding).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Authorization URL & state validation (pure)
// ---------------------------------------------------------------------------

/**
 * Build the Lark authorization URL with PKCE parameters.
 */
export function buildAuthorizationUrl(
  config: LarkAuthConfig,
  codeChallenge: string,
  state: string,
): string {
  const endpoint = ENDPOINTS[config.region].auth;
  const params = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${endpoint}?${params.toString()}`;
}

/**
 * Validate that the received state matches the expected value.
 * @returns `true` when the values match.
 */
export function validateState(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false;
  // Constant-time comparison to mitigate timing attacks.
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Token expiry check (pure)
// ---------------------------------------------------------------------------

/**
 * Check whether the access token in a {@link LarkTokenStore} has expired.
 *
 * A 60-second safety margin is applied so tokens are refreshed before the
 * absolute deadline.
 */
export function isTokenExpired(store: LarkTokenStore): boolean {
  return Date.now() >= store.expiresAt - 60_000;
}

// ---------------------------------------------------------------------------
// Token exchange (network, but no chrome dependency)
// ---------------------------------------------------------------------------

/**
 * Exchange an authorization code for tokens via the Lark OIDC endpoint.
 */
export async function exchangeCodeForTokens(
  config: LarkAuthConfig,
  code: string,
  codeVerifier: string,
): Promise<LarkTokenStore> {
  const endpoint = ENDPOINTS[config.region].token;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      app_id: config.appId,
      redirect_uri: config.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new LarkAuthError(
      response.status,
      0,
      `Token exchange failed: ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { data?: LarkTokenResponse };
  const data = json.data;
  if (!data) {
    throw new LarkAuthError(response.status, 0, 'Token exchange returned no data');
  }

  return tokenResponseToStore(data);
}

/**
 * Refresh an access token using a refresh token.
 */
export async function refreshAccessToken(
  config: LarkAuthConfig,
  refreshToken: string,
): Promise<LarkTokenStore> {
  const endpoint = ENDPOINTS[config.region].token;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      app_id: config.appId,
    }),
  });

  if (!response.ok) {
    throw new LarkAuthError(
      response.status,
      0,
      `Token refresh failed: ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { data?: LarkTokenResponse };
  const data = json.data;
  if (!data) {
    throw new LarkAuthError(response.status, 0, 'Token refresh returned no data');
  }

  return tokenResponseToStore(data);
}

// ---------------------------------------------------------------------------
// Token persistence (Chrome extension storage)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'lark_tokens';

/**
 * Persist tokens to Chrome extension storage.
 * - `chrome.storage.session`: volatile, cleared when browser closes.
 * - `chrome.storage.local`: persistent across restarts.
 */
export async function saveTokens(store: LarkTokenStore): Promise<void> {
  const payload = { [STORAGE_KEY]: store };
  await chrome.storage.session.set(payload);
  await chrome.storage.local.set(payload);
}

/**
 * Load tokens from Chrome storage.  Prefers session storage; falls back
 * to local storage (e.g. after browser restart).
 */
export async function loadTokens(): Promise<LarkTokenStore | null> {
  const session = await chrome.storage.session.get(STORAGE_KEY);
  if (session[STORAGE_KEY]) {
    return session[STORAGE_KEY] as LarkTokenStore;
  }
  const local = await chrome.storage.local.get(STORAGE_KEY);
  if (local[STORAGE_KEY]) {
    // Re-hydrate into session for faster subsequent reads.
    await chrome.storage.session.set({ [STORAGE_KEY]: local[STORAGE_KEY] });
    return local[STORAGE_KEY] as LarkTokenStore;
  }
  return null;
}

/**
 * Remove all persisted tokens.
 */
export async function clearTokens(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
  await chrome.storage.local.remove(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tokenResponseToStore(data: LarkTokenResponse): LarkTokenStore {
  const now = Date.now();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    refreshExpiresAt: now + data.refresh_expires_in * 1000,
  };
}
