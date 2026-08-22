/**
 * Which cached queries a domain event makes stale (M08-T08).
 *
 * The point of the live feed is to stop refetching everything on a timer, so
 * the mapping has to be *targeted*: a comment appearing on one task must not
 * re-run the project list, the dashboard and every board column. Kept as a
 * pure function of the subject so it can be tested without a socket.
 *
 * Keyed on the entity segment of `domain.<entity>.<action>` rather than the
 * full subject. Actions on one entity almost always invalidate the same
 * queries — created/updated/archived/restored/purged all mean "the list you
 * are holding is wrong" — and enumerating all 80 subjects would mean a new
 * publisher silently falls through the map.
 */

/**
 * Query-key roots per entity, matching the keys the feature screens actually
 * use. React Query treats these as prefixes, so `['tasks']` invalidates every
 * `['tasks', projectId, …]` variant without listing them.
 */
const KEYS_BY_ENTITY: Record<string, string[]> = {
  // 'reports' (M24): every Reports card derives from task activity — status
  // changes, handoff notes, comment churn — so those three entities keep the
  // exception and trend queries live; nothing else re-runs two report RPCs.
  task: ['tasks', 'task', 'dashboard', 'reports'],
  tasknote: ['handoffNotes', 'task', 'reports'],
  task_type: ['taskTypes', 'taskType'],
  task_status: ['taskTypes', 'taskType'],
  task_status_transition: ['taskTypes', 'taskType'],
  task_statuses: ['taskTypes', 'taskType'],
  project: ['projects', 'project', 'dashboard'],
  project_template: ['templates'],
  org: ['orgs', 'orgMembers', 'orgInvitations'],
  agent: ['agents', 'agentTokens'],
  agent_role: ['agentRoles', 'agents'],
  artifact: ['artifacts', 'artifactContent', 'artifactLocate'],
  folder: ['folders', 'artifacts'],
  comment: ['comments', 'reports'],
  label: ['labels'],
  team: ['teams', 'teamMembers'],
  role: ['roles', 'permissionsRoles'],
  grant: ['grants', 'teamGrants'],
  belief: ['memoryBeliefs', 'memoryBelief', 'memoryBeliefRelations', 'memoryBeliefPromotions'],
  repository: ['repositoryLinks', 'pullRequests', 'builds', 'deployments'],
  // A retention sweep can hard-delete rows anywhere. It is rare and its blast
  // radius is genuinely unbounded, which is the one case where dropping
  // everything is the honest answer.
  retention: [],
};

/** Subjects that mean "anything could have changed". */
const INVALIDATE_EVERYTHING = new Set(['domain.retention.swept', 'domain.org.purged']);

/** Control frames from the stream itself, not domain traffic. */
export function isControlFrame(subject: string): boolean {
  return subject.startsWith('stream.');
}

/**
 * The query-key prefixes this subject invalidates.
 *
 * Returns `null` for "invalidate everything" — distinct from `[]`, which means
 * this event touches nothing the GUI caches.
 *
 * An entity this map has never heard of narrows to the audit trail rather than
 * falling back to everything: a new backend publisher landing before this file
 * knows about it should cost a missed refresh, which the next navigation
 * fixes, not a cache stampede on every event it emits.
 */
export function queryKeysForSubject(subject: string): string[][] | null {
  if (isControlFrame(subject)) return [];
  if (INVALIDATE_EVERYTHING.has(subject)) return null;

  // The audit trail records every domain event, so it is stale after any of
  // them — including ones this map has never heard of. Invalidating an
  // inactive query costs nothing; React Query refetches only what is mounted.
  const entity = subject.split('.')[1];
  const keys = KEYS_BY_ENTITY[entity] ?? [];
  return [...keys, 'auditEvents'].map((k) => [k]);
}
