/**
 * Per-token rate limiting (ADR-0008).
 *
 * A fixed-capacity token bucket per credential: `capacity` requests may burst,
 * and the bucket refills at `capacity / windowMs`. A bucket beats a fixed
 * window because a fixed window lets a caller spend its whole allowance in the
 * last millisecond of one window and again in the first of the next — twice the
 * intended rate at the boundary, which is exactly when a retrying agent hits it.
 *
 * In-process and per-instance, deliberately. A shared counter needs Redis or a
 * database round trip on every request, and `tech-stack.md` has neither; adding
 * one to rate-limit a single-process deployment would be the expensive half of
 * a distributed system with none of the benefit. The consequence is stated
 * rather than hidden: with N backend instances the effective limit is N times
 * this one. **M11 owns multi-instance deployment and inherits this.**
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the next request would be permitted. At least 1. */
  retryAfterSeconds: number;
  remaining: number;
}

export interface RateLimiterOptions {
  /** Requests permitted in a burst. */
  capacity?: number;
  /** Time to refill an empty bucket completely. */
  windowMs?: number;
  /** Buckets idle this long are dropped. */
  idleEvictionMs?: number;
  /** Hard ceiling on tracked credentials. See the note in createRateLimiter. */
  maxBuckets?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const DEFAULTS = { capacity: 120, windowMs: 60_000, idleEvictionMs: 10 * 60_000, maxBuckets: 10_000 };

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const capacity = options.capacity ?? DEFAULTS.capacity;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const idleEvictionMs = options.idleEvictionMs ?? DEFAULTS.idleEvictionMs;
  const maxBuckets = options.maxBuckets ?? DEFAULTS.maxBuckets;
  const refillPerMs = capacity / windowMs;

  const buckets = new Map<string, Bucket>();

  /**
   * Drops buckets nobody has touched recently. Without this the map is an
   * unbounded memory leak keyed by credential: every token that ever made one
   * request would be retained for the life of the process.
   */
  function evictIdle(now: number) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > idleEvictionMs) buckets.delete(key);
    }
  }

  /**
   * Hard ceiling, because idle eviction alone is not enough.
   *
   * This keys on the presented token's hash *before* authentication - it has
   * to, since resolving a token id means the database lookup it exists to
   * protect - so anyone can create a bucket by sending a random `tskr_` string.
   * With only a 10-minute idle sweep, a flood of forged credentials grows the
   * map until memory runs out. Found by the M04-T12 security review.
   *
   * Evicts the *least constrained* buckets first - those with the most
   * allowance left - rather than the least recently used. LRU is wrong here:
   * during a flood the genuine credential is by definition the least recently
   * used, so LRU evicts exactly the bucket worth keeping and hands its holder a
   * fresh allowance. Dropping a bucket that is nearly full loses almost no
   * state; dropping one that is nearly empty discards the limit being enforced.
   */
  function enforceCeiling(now: number) {
    if (buckets.size < maxBuckets) return;
    evictIdle(now);
    if (buckets.size < maxBuckets) return;

    const byAllowance = [...buckets.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
    for (const [key] of byAllowance) {
      if (buckets.size < maxBuckets) break;
      buckets.delete(key);
    }
  }

  return {
    /** Consumes one unit for `key`, and says whether the request may proceed. */
    check(key: string, now: number = Date.now()): RateLimitDecision {
      let bucket = buckets.get(key);
      if (!bucket) {
        // Evicting on miss rather than on a timer keeps this dependency-free
        // and means an idle process holds no work.
        if (buckets.size > 0 && buckets.size % 64 === 0) evictIdle(now);
        enforceCeiling(now);
        bucket = { tokens: capacity, lastRefill: now };
        buckets.set(key, bucket);
      }

      const elapsed = Math.max(0, now - bucket.lastRefill);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
      bucket.lastRefill = now;

      if (bucket.tokens < 1) {
        const msUntilOne = (1 - bucket.tokens) / refillPerMs;
        return {
          allowed: false,
          // Rounded up, and never 0: a Retry-After of 0 invites an immediate
          // retry that is certain to be refused again.
          retryAfterSeconds: Math.max(1, Math.ceil(msUntilOne / 1000)),
          remaining: 0,
        };
      }

      bucket.tokens -= 1;
      return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(bucket.tokens) };
    },

    /** Test seam: how many buckets are being tracked. */
    size(): number {
      return buckets.size;
    },

    reset(): void {
      buckets.clear();
    },
  };
}

/**
 * The 429 body, as RFC 7807 problem details.
 *
 * This is why the limiter runs in an HTTP wrapper ahead of the Connect adapter
 * rather than inside a handler: ConnectRPC has its own error envelope, and
 * `lib/problemDetails.ts` says in its first line that it is not for RPC
 * endpoints. Throttling is a transport concern, so it is answered at the
 * transport (ADR-0008 §5). The cost is that generated Connect clients see a
 * transport-level failure rather than a typed error — the CLI recognises a bare
 * 429 for this reason.
 */
export function rateLimitProblem(retryAfterSeconds: number): { status: number; headers: Record<string, string>; body: string } {
  return {
    status: 429,
    headers: {
      'Content-Type': 'application/problem+json',
      'Retry-After': String(retryAfterSeconds),
    },
    body: JSON.stringify({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: `Rate limit exceeded. Retry after ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}.`,
    }),
  };
}
