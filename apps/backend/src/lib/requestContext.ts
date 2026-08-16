import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * `can()`'s (M10-T06) memo of what it has already resolved this request -
 * every entry keyed by whatever stays constant for the life of one request
 * (a userId, an org-scoped role, a role's own id), never by `scope` or
 * `permission`, so a second `can()` call for the same principal against a
 * *different* scope or permission still reuses it. See `policy.ts`'s own
 * doc comment for what each map holds and the staleness caveat that comes
 * with caching at request scope.
 */
export interface PolicyCache {
  teamIds: Map<string, string[]>;
  candidateGrants: Map<string, unknown[]>;
  orgMemberRole: Map<string, string | null>;
  rolePermissions: Map<string, Set<string>>;
}

export interface RequestContext {
  requestId: string;
  userId?: string | null;
  policyCache?: PolicyCache;
}

// Backs logger.ts's `mixin` so every log line emitted anywhere during a
// request's execution - not just the request-logging interceptor's own
// begin/end lines - automatically carries requestId/userId, without every
// call site having to thread them through manually.
const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStore.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStore.getStore();
}

/**
 * Lazily creates and returns the current request's `PolicyCache`, or `null`
 * outside a request (a script or a test calling `can()` directly, never
 * wrapped in `runWithRequestContext`) - `can()` treats `null` as "no cache,
 * query fresh every time," not an error, so those callers behave exactly as
 * they did before T06.
 */
export function getPolicyCache(): PolicyCache | null {
  const ctx = requestContextStore.getStore();
  if (!ctx) return null;
  if (!ctx.policyCache) {
    ctx.policyCache = {
      teamIds: new Map(),
      candidateGrants: new Map(),
      orgMemberRole: new Map(),
      rolePermissions: new Map(),
    };
  }
  return ctx.policyCache;
}
