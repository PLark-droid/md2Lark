/**
 * Tests for Lark API type definitions and error classes.
 */

import {
  ENDPOINTS,
  LarkApiError,
  LarkAuthError,
  LarkRateLimitError,
} from '../../src/lark-api/types.js';

// ---------------------------------------------------------------------------
// ENDPOINTS constant
// ---------------------------------------------------------------------------

describe('ENDPOINTS', () => {
  it('should have feishu and larksuite regions', () => {
    expect(ENDPOINTS).toHaveProperty('feishu');
    expect(ENDPOINTS).toHaveProperty('larksuite');
  });

  it('should expose auth, token, and api URLs for feishu', () => {
    const ep = ENDPOINTS.feishu;
    expect(ep.auth).toContain('feishu.cn');
    expect(ep.token).toContain('feishu.cn');
    expect(ep.api).toContain('feishu.cn');
  });

  it('should expose auth, token, and api URLs for larksuite', () => {
    const ep = ENDPOINTS.larksuite;
    expect(ep.auth).toContain('larksuite.com');
    expect(ep.token).toContain('larksuite.com');
    expect(ep.api).toContain('larksuite.com');
  });

  it('should have HTTPS URLs', () => {
    for (const region of ['feishu', 'larksuite'] as const) {
      const ep = ENDPOINTS[region];
      expect(ep.auth).toMatch(/^https:\/\//);
      expect(ep.token).toMatch(/^https:\/\//);
      expect(ep.api).toMatch(/^https:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// LarkApiError
// ---------------------------------------------------------------------------

describe('LarkApiError', () => {
  it('should be an instance of Error', () => {
    const err = new LarkApiError(400, 1001, 'Bad request');
    expect(err).toBeInstanceOf(Error);
  });

  it('should be an instance of LarkApiError', () => {
    const err = new LarkApiError(500, 2001, 'Internal error');
    expect(err).toBeInstanceOf(LarkApiError);
  });

  it('should store httpStatus and larkCode', () => {
    const err = new LarkApiError(403, 9999, 'Forbidden');
    expect(err.httpStatus).toBe(403);
    expect(err.larkCode).toBe(9999);
    expect(err.message).toBe('Forbidden');
  });

  it('should have name set to LarkApiError', () => {
    const err = new LarkApiError(400, 0, 'test');
    expect(err.name).toBe('LarkApiError');
  });
});

// ---------------------------------------------------------------------------
// LarkAuthError
// ---------------------------------------------------------------------------

describe('LarkAuthError', () => {
  it('should be an instance of LarkApiError', () => {
    const err = new LarkAuthError(401, 100, 'Unauthorized');
    expect(err).toBeInstanceOf(LarkApiError);
  });

  it('should be an instance of Error', () => {
    const err = new LarkAuthError(401, 100, 'Unauthorized');
    expect(err).toBeInstanceOf(Error);
  });

  it('should have name set to LarkAuthError', () => {
    const err = new LarkAuthError(401, 100, 'Unauthorized');
    expect(err.name).toBe('LarkAuthError');
  });

  it('should store httpStatus and larkCode', () => {
    const err = new LarkAuthError(401, 42, 'Invalid token');
    expect(err.httpStatus).toBe(401);
    expect(err.larkCode).toBe(42);
    expect(err.message).toBe('Invalid token');
  });
});

// ---------------------------------------------------------------------------
// LarkRateLimitError
// ---------------------------------------------------------------------------

describe('LarkRateLimitError', () => {
  it('should be an instance of LarkApiError', () => {
    const err = new LarkRateLimitError(429, 99998, 'Rate limited', 5000);
    expect(err).toBeInstanceOf(LarkApiError);
  });

  it('should be an instance of Error', () => {
    const err = new LarkRateLimitError(429, 99998, 'Rate limited', 5000);
    expect(err).toBeInstanceOf(Error);
  });

  it('should have name set to LarkRateLimitError', () => {
    const err = new LarkRateLimitError(429, 99998, 'Rate limited', 3000);
    expect(err.name).toBe('LarkRateLimitError');
  });

  it('should store retryAfterMs', () => {
    const err = new LarkRateLimitError(429, 99998, 'Rate limited', 7500);
    expect(err.retryAfterMs).toBe(7500);
    expect(err.httpStatus).toBe(429);
    expect(err.larkCode).toBe(99998);
  });
});
