/**
 * Which statuses a task may move to from `current` - the client-side copy of
 * the rule the server enforces in `validateStatusForTaskType`
 * (apps/backend/src/modules/tasks/tasks.handler.ts), so a picker never offers
 * a move that can only be refused (M32-T05).
 *
 * Returns `null` when the type imposes nothing (an untyped task, or a type
 * with no statuses): the caller falls back to its default set. Otherwise the
 * allowed names in pipeline order, always including `current` itself when it
 * belongs to the type.
 */
export interface TypeStateMachine {
  statuses: { id: string; name: string; position?: number }[];
  transitions: { fromStatusId: string; toStatusId: string }[];
}

export function allowedStatuses(type: TypeStateMachine | undefined, current: string): string[] | null {
  if (!type || type.statuses.length === 0) return null;
  const ordered = [...type.statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const currentRow = ordered.find((s) => s.name === current);
  // Server: a status that predates the type's machine may move anywhere in
  // it, and a type with no edges yet enforces membership only.
  if (!currentRow || type.transitions.length === 0) return ordered.map((s) => s.name);
  const targets = new Set(type.transitions.filter((t) => t.fromStatusId === currentRow.id).map((t) => t.toStatusId));
  return ordered.filter((s) => s.id === currentRow.id || targets.has(s.id)).map((s) => s.name);
}
