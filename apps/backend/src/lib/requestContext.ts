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
  orgAncestors: Map<string, string[]>;
}

/**
 * Who is acting, in the shape audit and event consumers want (M08-T04).
 * Separate from `userId` because an agent token has no user behind it, and
 * an audit trail that records only `userId` cannot say an agent did
 * something — it would look unattributed, which is the one thing an audit
 * trail must not be ambiguous about.
 */
export interface RequestActor {
  kind: 'user' | 'agent';
  userId?: string;
  agentId?: string;
}

export interface RequestContext {
  requestId: string;
  userId?: string | null;
  /** Filled in by the session interceptor once it has resolved the caller. */
  actor?: RequestActor;
  /** Filled in by the first authorization check. See `setRequestOrg`. */
  orgId?: string;
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
 * Records who is acting, on the context this request is already running in.
 *
 * The request context is opened by the logging interceptor, which resolves
 * only a session user id — it runs before any database handle is available
 * and adding a lookup there would put a query in front of every log line.
 * The session interceptor resolves the full principal a moment later, and
 * mutating the object the store holds makes it visible to everything after
 * it in the same async scope, including `withRequestCorrelation`.
 *
 * A no-op outside a request, so a script or a test calling a handler
 * directly behaves exactly as before.
 */
export function setRequestActor(actor: RequestActor): void {
  const ctx = requestContextStore.getStore();
  if (ctx) ctx.actor = actor;
}

/**
 * Records which organization this request is acting in (M08-T07).
 *
 * Set by the authorization check, which is the one place that already knows
 * the answer — every mutating handler resolves an org (or a project, whose
 * owning org `can()` looks up anyway) before it touches anything. Read by
 * `withRequestCorrelation`, which stamps it onto every domain event published
 * during the request.
 *
 * Without this, most events carry no tenant at all: a task row has a
 * `projectId` and no `orgId`, so `domain.task.*` — the highest-traffic subject
 * in the system — was published with nothing to scope it by. The live feed
 * dropped every one of them (it refuses to deliver an event it cannot
 * attribute to a tenant), and the audit trail recorded them against a null
 * org, where `listAuditEvents(orgId)` could never find them again.
 *
 * First writer wins. A request authorizes against the org it is about before
 * doing anything else; a later check against some *other* org (moving a
 * project between two, say) is a second scope, not a correction of the first.
 */
export function setRequestOrg(orgId: string): void {
  const ctx = requestContextStore.getStore();
  if (ctx && !ctx.orgId && orgId) ctx.orgId = orgId;
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
      orgAncestors: new Map(),
    };
  }
  return ctx.policyCache;
}
