import { describe, it, expect } from 'bun:test';
import { createRateLimiter, rateLimitProblem } from './rateLimit';

const limiter = (over = {}) => createRateLimiter({ capacity: 5, windowMs: 1000, ...over });

describe('token bucket', () => {
  it('allows a burst up to capacity, then refuses', () => {
    const rl = limiter();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rl.check('tok', now).allowed).toBe(true);
    }
    expect(rl.check('tok', now).allowed).toBe(false);
  });

  it('reports how many remain', () => {
    const rl = limiter();
    const now = 1_000_000;
    expect(rl.check('tok', now).remaining).toBe(4);
    expect(rl.check('tok', now).remaining).toBe(3);
  });

  it('recovers after the window, and gradually rather than all at once', () => {
    const rl = limiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rl.check('tok', t0);
    expect(rl.check('tok', t0).allowed).toBe(false);

    // One fifth of the window refills exactly one request.
    expect(rl.check('tok', t0 + 200).allowed).toBe(true);
    expect(rl.check('tok', t0 + 200).allowed).toBe(false);

    // A full window refills the whole bucket. check() consumes, so the first
    // call after the refill reports capacity - 1 remaining.
    const afterRefill = rl.check('tok', t0 + 1200);
    expect(afterRefill.allowed).toBe(true);
    expect(afterRefill.remaining).toBe(4);
  });

  it('never refills beyond capacity, however long it idles', () => {
    const rl = limiter();
    const t0 = 1_000_000;
    rl.check('tok', t0);
    // A day later the bucket is full, not a day's worth of credit.
    expect(rl.check('tok', t0 + 86_400_000).remaining).toBe(4);
  });

  it('keeps one credential from spending another\'s', () => {
    const rl = limiter();
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) rl.check('tok-a', now);
    expect(rl.check('tok-a', now).allowed).toBe(false);
    // Per-token, not global: one noisy agent must not throttle every other.
    expect(rl.check('tok-b', now).allowed).toBe(true);
  });
});

describe('retry-after', () => {
  it('is whole seconds, rounded up, and never zero', () => {
    const rl = limiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) rl.check('tok', t0);

    const decision = rl.check('tok', t0);
    // A Retry-After of 0 invites an immediate retry that is certain to fail.
    expect(decision.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(decision.retryAfterSeconds)).toBe(true);
  });

  it('is long enough that retrying at it actually succeeds', () => {
    const rl = limiter({ capacity: 2, windowMs: 10_000 });
    const t0 = 1_000_000;
    rl.check('tok', t0);
    rl.check('tok', t0);
    const refused = rl.check('tok', t0);
    expect(refused.allowed).toBe(false);

    // The contract of Retry-After: waiting that long and trying again works.
    const after = rl.check('tok', t0 + refused.retryAfterSeconds * 1000);
    expect(after.allowed).toBe(true);
  });
});

describe('memory', () => {
  it('evicts buckets nobody has touched, so the map is not an unbounded leak', () => {
    const rl = createRateLimiter({ capacity: 5, windowMs: 1000, idleEvictionMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 64; i++) rl.check(`tok-${i}`, t0);
    expect(rl.size()).toBe(64);

    // Keyed by credential, so without eviction every token that ever made one
    // request is retained for the life of the process.
    rl.check('later', t0 + 120_000);
    expect(rl.size()).toBeLessThan(64);
  });
});

describe('the 429 body', () => {
  it('is RFC 7807 problem details with a Retry-After header', () => {
    const problem = rateLimitProblem(7);
    expect(problem.status).toBe(429);
    expect(problem.headers['Content-Type']).toBe('application/problem+json');
    expect(problem.headers['Retry-After']).toBe('7');

    const body = JSON.parse(problem.body);
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Retry after 7 seconds.',
    });
  });

  it('says "1 second", not "1 seconds"', () => {
    expect(JSON.parse(rateLimitProblem(1).body).detail).toContain('1 second.');
  });
});

describe('bucket map is bounded', () => {
  it('does not grow without limit when a caller invents credentials', () => {
    // The limiter keys on the presented token's hash, before authentication —
    // it has to, because resolving a token id means the database lookup this
    // protects. So anything can create a bucket by sending a random tskr_
    // string, and an unbounded map turns that into memory exhaustion.
    const rl = createRateLimiter({ capacity: 5, windowMs: 1000, maxBuckets: 500 });
    const t0 = 1_000_000;
    for (let i = 0; i < 5000; i++) rl.check(`forged-${i}`, t0);
    expect(rl.size()).toBeLessThanOrEqual(500);
  });

  it('keeps the constrained buckets and drops the roomy ones', () => {
    const rl = createRateLimiter({ capacity: 5, windowMs: 1000, maxBuckets: 100 });
    const t0 = 1_000_000;
    // A real credential that has spent its allowance...
    for (let i = 0; i < 5; i++) rl.check('real', t0);
    // ...survives a flood of forged keys that have each spent one.
    for (let i = 0; i < 1000; i++) rl.check(`forged-${i}`, t0);
    // Evicting by least-recently-used would drop exactly this bucket and hand
    // its holder a fresh allowance, which is the opposite of the point.
    expect(rl.check('real', t0).allowed).toBe(false);
  });
});
