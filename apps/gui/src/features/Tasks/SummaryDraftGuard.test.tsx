import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { TaskService, TaskSummarySchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpcPending } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskSummaryPanel } from './TaskSummary';
import { SummaryDraftExitGuard } from './SummaryDraftGuard';
import { useSummaryDrafts } from './summaryDrafts';

beforeEach(() => { useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('guard-user'); });
afterEach(() => useSummaryDrafts.getState().endSession());
const nativeExit = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
const original = create(TaskSummarySchema, { text: 'Original', authorName: 'Ada', updatedAt: '2026-11-09T10:00:00Z' });

describe('global summary native-exit lifetime', () => {
  it('warns with closed panels, retains multiple task drafts, and stops only after the final Cancel', async () => {
    function Tasks() { const [task, setTask] = useState('a'); return <><SummaryDraftExitGuard /><button onClick={() => setTask(t => t === 'a' ? 'b' : t === 'b' ? '' : 'a')}>Next task</button>{task && <TaskSummaryPanel taskId={task} />}</>; }
    renderScoped(<StrictMode><Tasks /></StrictMode>);
    expect(nativeExit()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    expect(nativeExit()).toBe(false);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'A intent' } });
    expect(nativeExit()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'B intent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(nativeExit()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.queryByLabelText('Summary')).toBeNull();
    expect(nativeExit()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }));
    expect(screen.getByLabelText('Summary')).toHaveValue('A intent');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(nativeExit()).toBe(false);
  });

  it('treats unchanged and reverted content as clean until a different submitted version may commit', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    renderScoped(<><SummaryDraftExitGuard /><TaskSummaryPanel taskId="a" summary={original} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(nativeExit()).toBe(false);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Changed' } });
    expect(nativeExit()).toBe(true);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: original.text } });
    expect(nativeExit()).toBe(false);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Submitted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: original.text } });
    expect(nativeExit()).toBe(true);
    pending.resolve({ summary: { text: 'Submitted', authorName: 'Ada', updatedAt: '' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(nativeExit()).toBe(true);
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Submitted' } });
    expect(nativeExit()).toBe(false);
  });

  it('removes native protection when an exact submitted draft succeeds after its panel closes', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    function Task() { const [open, setOpen] = useState(true); return <><SummaryDraftExitGuard /><button onClick={() => setOpen(false)}>Close task</button>{open && <TaskSummaryPanel taskId="a" />}</>; }
    const { queryClient } = renderScoped(<Task />);
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Submitted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Close task' }));
    expect(nativeExit()).toBe(true);
    pending.resolve({ summary: { text: 'Submitted', authorName: 'Ada', updatedAt: '' } });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(nativeExit()).toBe(false);
  });

  it('drops all account drafts on identity change and ignores an old save result', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    const { queryClient } = renderScoped(<><SummaryDraftExitGuard /><TaskSummaryPanel taskId="a" /></>);
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Old account' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    act(() => useSummaryDrafts.getState().setAccount('next-user'));
    expect(nativeExit()).toBe(false);
    expect(screen.queryByLabelText('Summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New account' } });
    pending.resolve({ summary: { text: 'Old account', authorName: 'Old', updatedAt: '' } });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(screen.getByLabelText('Summary')).toHaveValue('New account');
    expect(nativeExit()).toBe(true);
  });
});
