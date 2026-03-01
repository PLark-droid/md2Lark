/**
 * Tests for Lark OAuth PKCE authentication utilities.
 *
 * Only pure functions are tested here. Chrome-dependent functions
 * (saveTokens, loadTokens, clearTokens) are tested with mocks.
 */

import { webcrypto } from 'crypto';

import {
  base64UrlEncode,
  buildAuthorizationUrl,
  clearTokens,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  isTokenExpired,
  loadTokens,
  saveTokens,
  validateState,
} from '../../src/lark-api/auth.js';
import type { LarkAuthConfig, LarkTokenStore } from '../../src/lark-api/types.js';

// ---------------------------------------------------------------------------
// Polyfill globalThis.crypto for Node.js test environment
// ---------------------------------------------------------------------------

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).crypto = webcrypto;
  }
});

// ---------------------------------------------------------------------------
// Chrome storage mock
// ---------------------------------------------------------------------------

type StorageData = Record<string, unknown>;

function createStorageAreaMock() {
  let data: StorageData = {};
  return {
    get: jest.fn((key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {})),
    set: jest.fn((items: StorageData) => {
      Object.assign(data, items);
      return Promise.resolve();
    }),
    remove: jest.fn((key: string) => {
      delete data[key];
      return Promise.resolve();
    }),
    _clear: () => { data = {}; },
  };
}

let sessionMock: ReturnType<typeof createStorageAreaMock>;
let localMock: ReturnType<typeof createStorageAreaMock>;

beforeEach(() => {
  sessionMock = createStorageAreaMock();
  localMock = createStorageAreaMock();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = {
    storage: {
      session: sessionMock,
      local: localMock,
    },
  };
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).chrome;
});

// ---------------------------------------------------------------------------
// base64UrlEncode
// ---------------------------------------------------------------------------

describe('base64UrlEncode', () => {
  it('should produce a valid Base64URL string (no +, /, or =)', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('should produce deterministic output', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255]);
    const a = base64UrlEncode(bytes);
    const b = base64UrlEncode(bytes);
    expect(a).toBe(b);
  });

  it('should handle empty input', () => {
    const encoded = base64UrlEncode(new Uint8Array([]));
    expect(encoded).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCodeVerifier
// ---------------------------------------------------------------------------

describe('generateCodeVerifier', () => {
  it('should return a non-empty string', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThan(0);
  });

  it('should be Base64URL encoded (no +, /, =)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).not.toMatch(/[+/=]/);
  });

  it('should generate unique values', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// generateCodeChallenge
// ---------------------------------------------------------------------------

describe('generateCodeChallenge', () => {
  it('should return a non-empty Base64URL string', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(0);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('should produce the same challenge for the same verifier', async () => {
    const verifier = 'test-verifier-static';
    const a = await generateCodeChallenge(verifier);
    const b = await generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('should produce different challenges for different verifiers', async () => {
    const a = await generateCodeChallenge('verifier-a');
    const b = await generateCodeChallenge('verifier-b');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// generateState
// ---------------------------------------------------------------------------

describe('generateState', () => {
  it('should return a non-empty Base64URL string', () => {
    const state = generateState();
    expect(state.length).toBeGreaterThan(0);
    expect(state).not.toMatch(/[+/=]/);
  });

  it('should generate unique values', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// validateState
// ---------------------------------------------------------------------------

describe('validateState', () => {
  it('should return true for matching states', () => {
    expect(validateState('abc123', 'abc123')).toBe(true);
  });

  it('should return false for different states', () => {
    expect(validateState('abc123', 'abc124')).toBe(false);
  });

  it('should return false for different lengths', () => {
    expect(validateState('short', 'longer-string')).toBe(false);
  });

  it('should return true for empty strings', () => {
    expect(validateState('', '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAuthorizationUrl
// ---------------------------------------------------------------------------

describe('buildAuthorizationUrl', () => {
  const config: LarkAuthConfig = {
    appId: 'cli_test_app',
    redirectUri: 'https://example.com/callback',
    region: 'larksuite',
  };

  it('should include all required query parameters', () => {
    const url = buildAuthorizationUrl(config, 'challenge', 'state123');
    expect(url).toContain('app_id=cli_test_app');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=state123');
    expect(url).toContain('code_challenge=challenge');
    expect(url).toContain('code_challenge_method=S256');
  });

  it('should use the correct region endpoint', () => {
    const url = buildAuthorizationUrl(config, 'c', 's');
    expect(url).toContain('larksuite.com');

    const feishuConfig: LarkAuthConfig = { ...config, region: 'feishu' };
    const feishuUrl = buildAuthorizationUrl(feishuConfig, 'c', 's');
    expect(feishuUrl).toContain('feishu.cn');
  });

  it('should return a valid URL', () => {
    const url = buildAuthorizationUrl(config, 'challenge', 'state');
    // Should not throw.
    const parsed = new URL(url);
    expect(parsed.protocol).toBe('https:');
  });
});

// ---------------------------------------------------------------------------
// isTokenExpired
// ---------------------------------------------------------------------------

describe('isTokenExpired', () => {
  it('should return false when token is still valid', () => {
    const store: LarkTokenStore = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 120_000, // 2 minutes from now
      refreshExpiresAt: Date.now() + 3_600_000,
    };
    expect(isTokenExpired(store)).toBe(false);
  });

  it('should return true when token has expired', () => {
    const store: LarkTokenStore = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000, // 1 second ago
      refreshExpiresAt: Date.now() + 3_600_000,
    };
    expect(isTokenExpired(store)).toBe(true);
  });

  it('should return true within the 60-second safety margin', () => {
    const store: LarkTokenStore = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 30_000, // 30 seconds from now (< 60s margin)
      refreshExpiresAt: Date.now() + 3_600_000,
    };
    expect(isTokenExpired(store)).toBe(true);
  });

  it('should return false just outside the safety margin', () => {
    const store: LarkTokenStore = {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 61_000, // 61 seconds from now (> 60s margin)
      refreshExpiresAt: Date.now() + 3_600_000,
    };
    expect(isTokenExpired(store)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Token persistence (Chrome storage mocks)
// ---------------------------------------------------------------------------

describe('saveTokens', () => {
  it('should store tokens in both session and local storage', async () => {
    const store: LarkTokenStore = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600_000,
      refreshExpiresAt: Date.now() + 86400_000,
    };

    await saveTokens(store);

    expect(sessionMock.set).toHaveBeenCalledWith({ lark_tokens: store });
    expect(localMock.set).toHaveBeenCalledWith({ lark_tokens: store });
  });
});

describe('loadTokens', () => {
  it('should return tokens from session storage if available', async () => {
    const store: LarkTokenStore = {
      accessToken: 'session-token',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
      refreshExpiresAt: Date.now() + 86400_000,
    };

    await saveTokens(store);
    const loaded = await loadTokens();

    expect(loaded).toEqual(store);
  });

  it('should fall back to local storage when session is empty', async () => {
    const store: LarkTokenStore = {
      accessToken: 'local-token',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
      refreshExpiresAt: Date.now() + 86400_000,
    };

    // Only store in local, not session.
    await localMock.set({ lark_tokens: store });
    sessionMock._clear();

    const loaded = await loadTokens();
    expect(loaded).toEqual(store);

    // Should have re-hydrated into session.
    expect(sessionMock.set).toHaveBeenCalled();
  });

  it('should return null when no tokens are stored', async () => {
    const loaded = await loadTokens();
    expect(loaded).toBeNull();
  });
});

describe('clearTokens', () => {
  it('should remove tokens from both storage areas', async () => {
    const store: LarkTokenStore = {
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: 0,
      refreshExpiresAt: 0,
    };
    await saveTokens(store);
    await clearTokens();

    expect(sessionMock.remove).toHaveBeenCalledWith('lark_tokens');
    expect(localMock.remove).toHaveBeenCalledWith('lark_tokens');

    const loaded = await loadTokens();
    expect(loaded).toBeNull();
  });
});
