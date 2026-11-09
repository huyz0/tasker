import type { QueryClient } from '@tanstack/react-query';
import { useSummaryDrafts } from '../features/Tasks/summaryDrafts';

/** A successful password response is authoritative before a later session read. */
export async function establishPasswordSession(client: QueryClient, result: { userId: string; mustChangePassword?: boolean }) {
  const changed = useSummaryDrafts.getState().accountId !== result.userId;
  useSummaryDrafts.getState().setAccount(result.userId);
  await client.cancelQueries(changed ? {} : { queryKey: ['authSession'] });
  // Preserve pending mutations: an older write must still fence a later one.
  if (changed) client.getQueryCache().clear();
  client.setQueryData(['authSession'], { authenticated: true, userId: result.userId,
    mustChangePassword: result.mustChangePassword ?? false });
  await client.invalidateQueries({ queryKey: ['authSession'] });
}
