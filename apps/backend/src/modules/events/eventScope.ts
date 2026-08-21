/**
 * Deciding which live events a subscriber may see (M08-T07).
 *
 * Kept apart from the streaming handler so the authorization rules can be
 * tested without a broker or a socket. These rules are the security boundary
 * of the feed: everything else in `events.handler.ts` is plumbing.
 */

export interface EventEnvelope {
  subject: string;
  orgId?: string | null;
  projectId?: string | null;
}

export interface SubscriptionScope {
  /** Every org the subscriber currently belongs to. */
  authorizedOrgIds: Set<string>;
  /** Optional narrowing the client asked for. */
  requestedOrgId?: string;
  requestedProjectId?: string;
}

/**
 * Whether one event may be delivered to one subscriber.
 *
 * Three rules, in order of how badly getting them wrong would hurt:
 *
 * 1. **An event with no org is never delivered.** Some events legitimately
 *    precede org membership (a user registering). They cannot be attributed
 *    to a tenant, so there is no one they can safely go to. Dropping them
 *    from the live feed costs nothing — the audit trail still records them.
 * 2. **Membership is the ceiling.** The event's org must be one the
 *    subscriber currently belongs to, regardless of what they asked for.
 * 3. **The client's narrowing applies underneath.** Asking for an org you do
 *    not belong to yields nothing rather than an error: the answer is the
 *    same either way, and an error would confirm that org exists.
 */
export function shouldDeliver(event: EventEnvelope, scope: SubscriptionScope): boolean {
  if (!event.orgId) return false;
  if (!scope.authorizedOrgIds.has(event.orgId)) return false;
  if (scope.requestedOrgId && event.orgId !== scope.requestedOrgId) return false;
  if (scope.requestedProjectId && event.projectId !== scope.requestedProjectId) return false;
  return true;
}

/**
 * Subjects that can change who belongs to what.
 *
 * A long-lived subscription authorized once at connect would keep streaming
 * an org's events to someone removed from it minutes ago. Rather than pay a
 * permission check per message per connection — on a feed whose whole point
 * is volume — the connection watches the stream it is already reading for
 * events that could alter its own answer, and re-resolves only then.
 */
const MEMBERSHIP_SUBJECTS = [
  // Creating an org makes the creator a member of it, which is the one way a
  // live subscriber's set can *widen*. `member_added` has no publisher today —
  // joining happens through invitation acceptance, which publishes nothing —
  // so it is listed for when that gap is closed rather than because it fires.
  'domain.org.created',
  'domain.org.member_added',
  'domain.org.member_removed',
  'domain.org.member_role_updated',
  'domain.org.archived',
  'domain.org.purged',
];

/**
 * Whether this event means the subscriber's org set might be stale.
 *
 * Deliberately not filtered by whether the event is *about* this subscriber:
 * the payload naming a user is not something to trust for an authorization
 * decision, and re-resolving is one indexed query against a set that changes
 * rarely. Cheap, and wrong in the safe direction.
 */
export function invalidatesScope(event: EventEnvelope): boolean {
  return MEMBERSHIP_SUBJECTS.includes(event.subject);
}

/**
 * Extracts the routing fields a subscriber needs from a raw event payload.
 *
 * Returns null for anything unparseable so a malformed message is skipped
 * rather than taking the connection down with it.
 */
export function toEnvelope(subject: string, payload: unknown): EventEnvelope | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  return {
    subject,
    orgId: typeof p.orgId === 'string' ? p.orgId : null,
    projectId: typeof p.projectId === 'string' ? p.projectId : null,
  };
}
