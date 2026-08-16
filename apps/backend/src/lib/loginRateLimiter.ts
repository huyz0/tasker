import { createRateLimiter } from './rateLimit';
import { config } from '../config';

/**
 * Per-source-IP throttle on `/api/auth/password/{login,register}` (M13-T07).
 *
 * Reuses `createRateLimiter` (ADR-0008 §5's bucket store) rather than a new
 * implementation: it is already a bounded, correctly-evicting map — the
 * eviction lesson from that ADR (LRU is wrong under flood; evict the
 * *least-constrained* bucket, not the least-recently-used one) applies
 * identically here, so a second hand-rolled limiter would just be a second
 * place to get it wrong.
 *
 * Keyed by source IP rather than by username: it has to run *before*
 * anything about the request is known to be genuine (an unauthenticated
 * login attempt for a username that does not exist is exactly the traffic
 * this exists to bound), so there is no credential to key on the way the
 * agent-token limiter keys on a token hash. This is deliberately a
 * different, complementary mechanism from the per-account exponential
 * lockout in `password_credentials` (see `modules/auth/auth.ts`'s
 * `attemptPasswordLogin`): that one stops one attacker from grinding one
 * account; this one stops one source from grinding the endpoint at all,
 * including against usernames that were never registered.
 */
export function createLoginRateLimiter() {
  return createRateLimiter({
    capacity: config.passwordLoginRateLimitBurst,
    windowMs: config.passwordLoginRateLimitWindowMs,
  });
}
