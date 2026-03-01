/**
 * Tests for the Token Bucket rate limiter and exponential backoff retry.
 */

import { RateLimiter, withRetry } from '../../src/lark-api/rate-limiter.js';

// ---------------------------------------------------------------------------
// RateLimiter (Token Bucket)
// ---------------------------------------------------------------------------

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialise with maxTokens available', () => {
    const limiter = new RateLimiter(5, 1000);
    expect(limiter.availableTokens).toBe(5);
  });

  it('should decrement tokens on acquire', async () => {
    const limiter = new RateLimiter(3, 1000);
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(2);
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(1);
  });

  it('should refill tokens after the refill interval', async () => {
    const limiter = new RateLimiter(2, 1000);
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);

    // Advance time past the refill interval.
    jest.advanceTimersByTime(1001);
    expect(limiter.availableTokens).toBe(2);
  });

  it('should wait when no tokens are available', async () => {
    const limiter = new RateLimiter(1, 500);
    // Consume the single token.
    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);

    // Start acquire which should wait.
    const acquirePromise = limiter.acquire();

    // Advance time to trigger the sleep resolution.
    jest.advanceTimersByTime(501);
    await acquirePromise;

    // After refill + consume, we expect maxTokens - 1 = 0.
    expect(limiter.availableTokens).toBe(0);
  });

  it('should allow custom maxTokens and refillIntervalMs', () => {
    const limiter = new RateLimiter(10, 2000);
    expect(limiter.availableTokens).toBe(10);
  });

  it('should use defaults when no arguments are provided', () => {
    const limiter = new RateLimiter();
    expect(limiter.availableTokens).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    // Mock Math.random to return 1.0 so jitter multiplier is always 1.0
    // (0.5 + 1.0 * 0.5 = 1.0), making delay deterministic for testing.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1.0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  const getStatus = (err: unknown): number | undefined => {
    if (err instanceof Error && 'status' in err) {
      return (err as Error & { status: number }).status;
    }
    return undefined;
  };

  const createHttpError = (status: number, msg = 'error'): Error & { status: number } => {
    const error = new Error(msg) as Error & { status: number };
    error.status = status;
    return error;
  };

  it('should return the result on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, getStatus);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 429 up to maxRetries429 times', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(createHttpError(429))
      .mockRejectedValueOnce(createHttpError(429))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, getStatus, {
      maxRetries429: 4,
      baseDelay429Ms: 100,
    });

    // First retry delay: 100ms
    await jest.advanceTimersByTimeAsync(100);
    // Second retry delay: 200ms
    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting 429 retries', async () => {
    jest.useRealTimers();
    const fn = jest.fn().mockRejectedValue(createHttpError(429));

    await expect(
      withRetry(fn, getStatus, {
        maxRetries429: 2,
        baseDelay429Ms: 1,
      }),
    ).rejects.toThrow('error');
    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
    jest.useFakeTimers();
  });

  it('should retry on 5xx up to maxRetries5xx times', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(createHttpError(503))
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, getStatus, {
      maxRetries5xx: 3,
      baseDelay5xxMs: 200,
    });

    // First retry delay: 200ms
    await jest.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting 5xx retries', async () => {
    jest.useRealTimers();
    const fn = jest.fn().mockRejectedValue(createHttpError(500));

    await expect(
      withRetry(fn, getStatus, {
        maxRetries5xx: 1,
        baseDelay5xxMs: 1,
      }),
    ).rejects.toThrow('error');
    // 1 initial + 1 retry = 2 calls
    expect(fn).toHaveBeenCalledTimes(2);
    jest.useFakeTimers();
  });

  it('should not retry on 4xx errors (except 429)', async () => {
    const fn = jest.fn().mockRejectedValue(createHttpError(400));

    await expect(withRetry(fn, getStatus)).rejects.toThrow('error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry when getStatus returns undefined', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('non-http'));

    await expect(withRetry(fn, getStatus)).rejects.toThrow('non-http');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should handle mixed 429 and 5xx errors in sequence', async () => {
    jest.useRealTimers();
    const fn = jest.fn()
      .mockRejectedValueOnce(createHttpError(429))
      .mockRejectedValueOnce(createHttpError(503))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, getStatus, {
      maxRetries429: 4,
      maxRetries5xx: 3,
      baseDelay429Ms: 1,
      baseDelay5xxMs: 1,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
    jest.useFakeTimers();
  });

  it('should use exponential backoff for 429 delays', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(createHttpError(429))
      .mockRejectedValueOnce(createHttpError(429))
      .mockRejectedValueOnce(createHttpError(429))
      .mockResolvedValue('done');

    const promise = withRetry(fn, getStatus, {
      maxRetries429: 4,
      baseDelay429Ms: 100,
    });

    // Delay 1: 100 * 2^0 = 100ms
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Delay 2: 100 * 2^1 = 200ms
    await jest.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    // Delay 3: 100 * 2^2 = 400ms
    await jest.advanceTimersByTimeAsync(400);

    const result = await promise;
    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// RateLimiter with maxTokens=1
// ---------------------------------------------------------------------------

describe('RateLimiter with maxTokens=1', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should work correctly with a single token', async () => {
    const limiter = new RateLimiter(1, 500);
    expect(limiter.availableTokens).toBe(1);

    await limiter.acquire();
    expect(limiter.availableTokens).toBe(0);

    // After refill interval, should have 1 token again
    jest.advanceTimersByTime(501);
    expect(limiter.availableTokens).toBe(1);
  });
});
