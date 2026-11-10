import { useEffect, type ReactNode } from 'react';
import { TaskReportScopeProvider } from '../src/features/Tasks/TaskReportScope';
import { useSummaryDrafts } from '../src/features/Tasks/summaryDrafts';
import { claimStoryOwner } from './claimReceiptFixture';

export function ClaimReportOwner({ children }: { children: ReactNode }) {
  useEffect(() => {
    useSummaryDrafts.getState().setAccount(claimStoryOwner.accountId);
    return () => useSummaryDrafts.getState().endSession();
  }, []);
  return <TaskReportScopeProvider {...claimStoryOwner}><div className="max-w-2xl min-w-0 p-panel">{children}</div></TaskReportScopeProvider>;
}
