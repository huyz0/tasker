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
  // 'taskLinks' (M35): a link, unlink or unblock changes the open task's
  // relations panel as well as the board's blocked badges.
  task: ['tasks', 'task', 'taskLinks', 'dashboard', 'reports'],
  // 'taskNotes' (M32-T01) is the open task's notes panel and handoff summary.
  // Keys match by whole element, so 'task' never covered it and the panel
  // supervisors watch agents in did not live-update.
  tasknote: ['handoffNotes', 'taskNotes', 'task', 'reports'],
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
  // M37: webhook management events (create, update, delete, rotate).
  webhook: ['webhooks', 'webhookDeliveries'],
  // M29: for a future publisher that names a notification entity directly.
  // `domain.task.stalled` does not come through here - see
  // EXTRA_KEYS_BY_SUBJECT below for why it is handled per-subject.
  notification: ['notifications', 'notificationCount'],
  // A retention sweep can hard-delete rows anywhere. It is rare and its blast
  // radius is genuinely unbounded, which is the one case where dropping
  // everything is the honest answer.
  retention: [],
};

/**
 * Keys a *specific subject* invalidates, beyond whatever its entity does.
 *
 * The map above is keyed by entity on purpose — actions on one entity almost
 * always invalidate the same queries, and enumerating all 80 subjects would
 * mean a new publisher silently falls through. `domain.task.stalled` (M29) is
 * the case that argument does not cover: it is a task subject, but the queries
 * it makes stale are the notification bell's, and adding those to `task` would
 * refetch the bell on every task edit, create and archive in the app. One
 * subject, one exception, rather than bending the entity map around it.
 */
const EXTRA_KEYS_BY_SUBJECT: Record<string, string[]> = {
  'domain.task.stalled': ['notifications', 'notificationCount'],
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
  const extra = EXTRA_KEYS_BY_SUBJECT[subject] ?? [];
  return [...keys, ...extra, 'auditEvents'].map((k) => [k]);
}
