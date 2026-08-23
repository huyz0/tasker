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
  /**
   * The token's scopes, for an agent principal (M26-T02, ADR-0023).
   *
   * Absent for a human session, and absent means unfiltered: a signed-in
   * user's feed is decided by org membership exactly as M08 built it. Only
   * an agent's delivery is narrowed by what its token may read.
   */
  agentScopes?: ReadonlySet<string>;
}

/**
 * Which scope an agent must hold to see each subject family, derived from
 * `AGENT_RPC_SCOPES`' existing *read* methods rather than invented here
 * (ADR-0023). The rule it encodes: an agent may see an event only where its
 * scopes would have permitted the equivalent read through an ordinary RPC —
 * so the feed and the request path cannot drift into disagreeing about what
 * a token may know.
 *
 * A family absent from this map is never delivered to an agent. That covers
 * `org`, `team`, `role`, `grant` and `retention`, for which no agent read
 * scope exists anywhere in the vocabulary, and it is also what a newly
 * introduced family gets until someone maps it — absence means denial here
 * for the same reason it does in `scopes.ts`.
 */
const SUBJECT_FAMILY_SCOPE: Readonly<Record<string, string>> = {
  task: 'tasks:read',                    // listTasks, getTask
  task_type: 'tasks:read',               // listTaskTypes
  task_status: 'tasks:read',
  task_statuses: 'tasks:read',
  task_status_transition: 'tasks:read',
  tasknote: 'tasks:read',                // listTaskNotes
  comment: 'tasks:read',                 // listComments — reading is tasks:read
  artifact: 'artifacts:read',            // listArtifacts
  folder: 'artifacts:read',              // listFolders
  project: 'projects:read',              // listProjects
  project_template: 'projects:read',     // listTemplates
  label: 'projects:read',                // listLabels
  agent: 'agents:read',                  // listAgents, listAgentRoles
  agent_role: 'agents:read',
  belief: 'memory:read',                 // listBeliefs
  repository: 'repos:read',              // listRepositoryLinks
};

/**
 * Subjects no agent token may ever receive, whatever it holds.
 *
 * Token issuance is a categorical exclusion in `scopes.ts` — `listAgentTokens`
 * is deliberately absent from `AGENT_RPC_SCOPES` — but these two subjects sit
 * inside the `agent` family, which `agents:read` otherwise opens. Without this
 * carve-out the feed would grant through the back door exactly the visibility
 * the request path refuses at the front.
 */
const AGENT_NEVER_DELIVERED: ReadonlySet<string> = new Set([
  'domain.agent.token_created',
  'domain.agent.token_revoked',
]);

/**
 * Whether an agent holding `scopes` may receive `subject`.
 *
 * Deliberately not exported: `shouldDeliver` is the feed's whole
 * authorization surface, and the tests drive this through it so they assert
 * the rule as it actually composes with the org and narrowing rules rather
 * than in isolation.
 */
function agentMayReceive(subject: string, scopes: ReadonlySet<string>): boolean {
  if (AGENT_NEVER_DELIVERED.has(subject)) return false;
  // `domain.<family>.<action>` — the pump only ever sees `domain.>`.
  const family = subject.split('.')[1];
  const required = family ? SUBJECT_FAMILY_SCOPE[family] : undefined;
  return required !== undefined && scopes.has(required);
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
 * 4. **An agent additionally sees only what its scopes could have read**
 *    (M26-T02, ADR-0023). Applied last because it is the narrowest rule and
 *    only ever subtracts; a human session has no `agentScopes` and reaches
 *    this line unchanged.
 */
export function shouldDeliver(event: EventEnvelope, scope: SubscriptionScope): boolean {
  if (!event.orgId) return false;
  if (!scope.authorizedOrgIds.has(event.orgId)) return false;
  if (scope.requestedOrgId && event.orgId !== scope.requestedOrgId) return false;
  if (scope.requestedProjectId && event.projectId !== scope.requestedProjectId) return false;
  if (scope.agentScopes && !agentMayReceive(event.subject, scope.agentScopes)) return false;
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
