import { create } from 'zustand';
import { useMutationState, type QueryClient } from '@tanstack/react-query';

export interface SummaryScope { accountId: string | null; generation: number; }
export interface SummaryDraft {
  id: string;
  revision: number;
  baseline: string;
  text: string;
}
/** Local mutation metadata; only taskId/text are sent through the existing RPC. */
export interface SummaryWrite extends SummaryScope {
  taskId: string;
  text: string;
  entryId?: string;
  revision?: number;
}
interface SummaryDraftState extends SummaryScope {
  entries: Record<string, SummaryDraft>;
  setAccount: (accountId: string | null) => void;
  endSession: () => void;
  discardSessionDrafts: () => void;
  begin: (scope: SummaryScope, taskId: string, baseline: string) => void;
  edit: (scope: SummaryScope, taskId: string, entryId: string, text: string) => void;
  discard: (scope: SummaryScope, taskId: string, entryId: string) => void;
  accept: (write: SummaryWrite, savedText: string) => void;
}
const matches = (a: SummaryScope, b: SummaryScope) => a.accountId === b.accountId && a.generation === b.generation;

/** Session-memory UI intent. Never persisted, and never a source of authority. */
export const useSummaryDrafts = create<SummaryDraftState>((set) => ({
  accountId: null, generation: 0, entries: {},
  setAccount: accountId => set(current => current.accountId === accountId ? current
    : { accountId, generation: current.generation + 1, entries: {} }),
  endSession: () => set(current => ({ accountId: null, generation: current.generation + 1, entries: {} })),
  discardSessionDrafts: () => set(current => ({ generation: current.generation + 1, entries: {} })),
  begin: (scope, taskId, baseline) => set(current => !scope.accountId || !matches(scope, current) || current.entries[taskId] ? current
    : { entries: { ...current.entries, [taskId]: { id: crypto.randomUUID(), revision: 0, baseline, text: baseline } } }),
  edit: (scope, taskId, entryId, text) => set(current => {
    const entry = current.entries[taskId];
    if (!matches(scope, current) || entry?.id !== entryId || entry.text === text) return current;
    return { entries: { ...current.entries, [taskId]: { ...entry, revision: entry.revision + 1, text } } };
  }),
  discard: (scope, taskId, entryId) => set(current => {
    if (!matches(scope, current) || current.entries[taskId]?.id !== entryId) return current;
    const entries = { ...current.entries }; delete entries[taskId]; return { entries };
  }),
  accept: (write, savedText) => set(current => {
    const entry = current.entries[write.taskId];
    if (write.accountId !== current.accountId || !entry) return current;
    const entries = { ...current.entries };
    if (matches(write, current) && entry.id === write.entryId && entry.revision === write.revision) delete entries[write.taskId];
    // A successful earlier version changes the baseline, never newer intent.
    // A discarded/reopened entry or later same-account generation keeps its
    // identity/text; the receipt only advances the known server baseline.
    else entries[write.taskId] = { ...entry, baseline: savedText };
    return { entries };
  }),
}));

export const SUMMARY_WRITES = ['summaryWrites'] as const;
export const SESSION_LOGOUT = ['sessionLogout'] as const;
export function useSummarySessionEnding() {
  return useMutationState({ filters: { mutationKey: SESSION_LOGOUT, status: 'pending' }, select: () => true }).length > 0;
}
export function usePendingSummaryWrites() {
  return useMutationState({ filters: { mutationKey: SUMMARY_WRITES, status: 'pending' },
    select: mutation => mutation.state.variables as SummaryWrite,
  });
}
export function useSummaryWriteError(scope: SummaryScope, taskId: string, entryId?: string) {
  const attempts = useMutationState({ filters: { mutationKey: SUMMARY_WRITES }, select: mutation => ({
    write: mutation.state.variables as SummaryWrite, status: mutation.state.status, error: mutation.state.error,
  }) });
  const latest = attempts.filter(attempt => attempt.write && matches(attempt.write, scope)
    && attempt.write.taskId === taskId && attempt.write.entryId === entryId).at(-1);
  return latest?.status === 'error' ? latest.error : null;
}
function summaryWriteTargets(write: SummaryWrite, scope: SummaryScope, taskId: string) {
  return write.accountId === scope.accountId && write.taskId === taskId;
}
export function summaryWritePending(client: QueryClient, taskId: string) {
  return client.getMutationCache().findAll({ mutationKey: SUMMARY_WRITES, status: 'pending' })
    .some(mutation => (mutation.state.variables as SummaryWrite).taskId === taskId);
}
export function summaryDirty(entry: SummaryDraft, scope: SummaryScope, taskId: string, pending: SummaryWrite[]) {
  return entry.text !== entry.baseline || pending.some(write => summaryWriteTargets(write, scope, taskId) && write.text !== entry.text);
}
export function summarySubmission(scope: SummaryScope, taskId: string, text: string): SummaryWrite | undefined {
  const current = useSummaryDrafts.getState();
  if (!scope.accountId || !matches(scope, current)) return undefined;
  const entry = current.entries[taskId];
  return { ...scope, taskId, text, ...(entry ? { entryId: entry.id, revision: entry.revision } : {}) };
}
