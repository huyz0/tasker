import { describe, it, expect } from 'bun:test';
import { createLoginRateLimiter } from './loginRateLimiter';
import { config } from '../config';

describe('createLoginRateLimiter', () => {
  it('is configured from passwordLoginRateLimit* config, not the agent limiter\'s defaults', () => {
    const limiter = createLoginRateLimiter();
    // Consume exactly the configured burst; the next request must be refused.
    for (let i = 0; i < config.passwordLoginRateLimitBurst; i++) {
      expect(limiter.check('1.2.3.4', 0).allowed).toBe(true);
    }
    expect(limiter.check('1.2.3.4', 0).allowed).toBe(false);
  });

  it('tracks each source IP independently — one flooded IP does not throttle another', () => {
    const limiter = createLoginRateLimiter();
    for (let i = 0; i < config.passwordLoginRateLimitBurst; i++) {
      limiter.check('flooded-ip', 0);
    }
    expect(limiter.check('flooded-ip', 0).allowed).toBe(false);
    expect(limiter.check('a-different-ip', 0).allowed).toBe(true);
  });
});
