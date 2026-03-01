/**
 * Rate limiter for Lark API calls.
 *
 * Uses Token Bucket algorithm (default 5 QPS) combined with
 * exponential backoff retry logic for 429 / 5xx errors.
 */

/**
 * Token Bucket rate limiter.
 *
 * Tokens are refilled to `maxTokens` every `refillIntervalMs` milliseconds.
 * Callers must {@link acquire} a token before making an API call.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;

  constructor(maxTokens = 5, refillIntervalMs = 1000) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Acquire a single token, waiting if the bucket is empty.
   * After the wait the bucket is refilled and one token is consumed.
   */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.refill();
    // Guard against tokens still being zero or negative after refill
    // (e.g. if refillIntervalMs has not fully elapsed due to timer jitter).
    if (this.tokens <= 0) {
      await this.sleep(this.refillIntervalMs);
      this.refill();
    }
    this.tokens--;
  }

  /** Number of tokens currently available without waiting. */
  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- Exponential Backoff Retry ---

/**
 * Options controlling retry behaviour.
 */
export interface RetryOptions {
  /** Maximum retries for HTTP 429 (Too Many Requests). Default: 4. */
  maxRetries429?: number;
  /** Maximum retries for HTTP 5xx (Server Error). Default: 3. */
  maxRetries5xx?: number;
  /** Base delay in ms before first 429 retry. Default: 1000. */
  baseDelay429Ms?: number;
  /** Base delay in ms before first 5xx retry. Default: 2000. */
  baseDelay5xxMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries429: 4,
  maxRetries5xx: 3,
  baseDelay429Ms: 1000,
  baseDelay5xxMs: 2000,
};

/**
 * Execute `fn` with exponential-backoff retry for transient errors.
 *
 * - **429**: retries up to `maxRetries429` times with delays 1s, 2s, 4s, 8s ...
 * - **5xx**: retries up to `maxRetries5xx` times with delays 2s, 4s, 8s ...
 * - **4xx (except 429)**: throws immediately (no retry).
 *
 * @param fn - The async operation to execute.
 * @param getStatus - Extract an HTTP status code from a caught error, or
 *                    `undefined` if the error is not HTTP-related.
 * @param options - Override default retry parameters.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  getStatus: (error: unknown) => number | undefined,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt429 = 0;
  let attempt5xx = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const status = getStatus(error);

      if (status === 429 && attempt429 < opts.maxRetries429) {
        const baseDelay = opts.baseDelay429Ms * Math.pow(2, attempt429);
        const delay = baseDelay * (0.5 + Math.random() * 0.5);
        attempt429++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (status !== undefined && status >= 500 && attempt5xx < opts.maxRetries5xx) {
        const baseDelay = opts.baseDelay5xxMs * Math.pow(2, attempt5xx);
        const delay = baseDelay * (0.5 + Math.random() * 0.5);
        attempt5xx++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }
}
