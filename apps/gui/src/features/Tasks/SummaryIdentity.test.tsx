import { StrictMode } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScoped } from '../../test/renderScoped';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { SummaryDraftExitGuard } from './SummaryDraftGuard';
import { TaskSummaryPanel } from './TaskSummary';
import { useSummaryDrafts } from './summaryDrafts';

let session = { authenticated: true, userId: 'account-a' as string | null, isLoading: false, isFetching: false, error: null as Error | null };
vi.mock('../../hooks/useAuthSession', () => ({ useAuthSession: () => session }));
vi.mock('../../lib/devAuthBootstrap', () => ({ ensureDevSession: () => new Promise<never>(() => {}) }));
beforeEach(() => { session = { authenticated: true, userId: 'account-a', isLoading: false, isFetching: false, error: null };
  useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('account-a'); });
afterEach(() => useSummaryDrafts.getState().endSession());
function SessionTask() { return <><SummaryDraftExitGuard /><ProtectedRoute><TaskSummaryPanel taskId="task" /></ProtectedRoute></>; }
const edit = () => { fireEvent.click(screen.getByRole('button', { name: 'Write a summary' })); fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Account A draft' } }); };
const warns = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };

describe('summary identity lifetime before protected routing', () => {
  it('clears old account text before a confirmed different account can edit', async () => {
    const view = renderScoped(<SessionTask />);
    edit();
    session = { ...session, userId: 'account-b' };
    view.rerender();
    await waitFor(() => expect(screen.queryByLabelText('Summary')).toBeNull());
    expect(warns()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    expect(screen.getByLabelText('Summary')).toHaveValue('');
  });

  it('clears known logout even when auth enforcement/dev routing returns early', async () => {
    const view = renderScoped(<SessionTask />);
    edit();
    session = { ...session, authenticated: false, userId: null };
    view.rerender();
    await waitFor(() => expect(warns()).toBe(false));
    act(() => useSummaryDrafts.getState().setAccount('account-a'));
    const restored = renderScoped(<TaskSummaryPanel taskId="task" />);
    expect(restored.queryByLabelText('Summary')).toBeNull();
  });

  it('does not adopt a stale cached account while a newly mounted session is being verified', async () => {
    useSummaryDrafts.getState().endSession();
    session = { ...session, isFetching: true };
    const view = renderScoped(<SessionTask />);
    expect(screen.queryByText(/No summary yet/)).toBeNull();
    session = { ...session, userId: 'account-b', isFetching: false };
    view.rerender();
    expect(await screen.findByRole('button', { name: 'Write a summary' })).toBeEnabled();
  });

  it('keeps existing drafts through a transient session lookup failure and StrictMode remount', async () => {
    const first = renderScoped(<StrictMode><SessionTask /></StrictMode>);
    edit();
    session = { ...session, error: new Error('Session lookup offline') };
    first.rerender();
    expect(screen.getByLabelText('Summary')).toHaveValue('Account A draft');
    first.unmount();
    renderScoped(<StrictMode><SessionTask /></StrictMode>);
    expect(screen.getByLabelText('Summary')).toHaveValue('Account A draft');
    expect(warns()).toBe(true);
  });
});
