import { useEffect, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SUMMARY_WRITES, summaryDirty, usePendingSummaryWrites, useSummaryDrafts, type SummaryWrite } from './summaryDrafts';

/** Best-effort native protection lives above routes, even with every editor closed. */
export function SummaryDraftExitGuard() {
  const state = useSummaryDrafts();
  const pending = usePendingSummaryWrites();
  const client = useQueryClient();
  const dirty = Object.entries(state.entries).some(([taskId, entry]) => summaryDirty(entry, state, taskId, pending));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = useSummaryDrafts.getState();
      const writes = client.getMutationCache().findAll({ mutationKey: SUMMARY_WRITES, status: 'pending' })
        .map(mutation => mutation.state.variables as SummaryWrite);
      if (!Object.entries(current.entries).some(([taskId, entry]) => summaryDirty(entry, current, taskId, writes))) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, client]);
  return null;
}

interface DraftIdentity {
  authenticated: boolean;
  userId: string | null;
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
}

/** Called before routing early returns; unknown lookups cannot discard intent. */
export function useSummaryDraftIdentity(session: DraftIdentity) {
  const current = useSummaryDrafts(s => s.accountId);
  const owner = session.authenticated ? session.userId : null;
  const verified = !session.isLoading && !session.isFetching && !session.error;
  useLayoutEffect(() => {
    if (verified) useSummaryDrafts.getState().setAccount(owner);
  }, [owner, verified]);
  // A known account may stay active through a background lookup failure.
  // An empty registry cannot adopt a stale cached account during verification.
  return current === owner && (verified || current !== null);
}
