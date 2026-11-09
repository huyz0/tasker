import { useState } from 'react';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { TaskService, TaskSummarySchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskSummaryPanel } from './TaskSummary';
import { useSummaryDrafts } from './summaryDrafts';

beforeEach(() => { useSummaryDrafts.getState().endSession(); useSummaryDrafts.getState().setAccount('summary-user'); });
afterEach(() => useSummaryDrafts.getState().endSession());

const original = create(TaskSummarySchema, { text: 'Original outcome', authorName: 'Ada', updatedAt: '2026-11-09T10:00:00Z' });
const write = async (text: string, editing = false) => {
  fireEvent.click(screen.getByRole('button', { name: editing ? 'Edit' : 'Write a summary' }));
  fireEvent.change(await screen.findByLabelText('Summary'), { target: { value: text } });
};

describe('summary intent across task lifetime', () => {
  it('never renders A text in B and restores A when returning', async () => {
    function Tasks() { const [task, setTask] = useState('a'); return <><button onClick={() => setTask(t => t === 'a' ? 'b' : 'a')}>Switch task</button><TaskSummaryPanel taskId={task} /></>; }
    renderScoped(<Tasks />);
    await write('Only task A');
    fireEvent.click(screen.getByRole('button', { name: 'Switch task' }));
    expect(screen.queryByLabelText('Summary')).toBeNull();
    expect(screen.getByText(/No summary yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch task' }));
    expect(await screen.findByLabelText('Summary')).toHaveValue('Only task A');
    expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
  });

  it('retains a dirty draft when the panel unmounts and restores it on reopening', async () => {
    function Task() { const [open, setOpen] = useState(true); return <><button onClick={() => setOpen(o => !o)}>Toggle task</button>{open && <TaskSummaryPanel taskId="a" />}</>; }
    renderScoped(<Task />);
    await write('Retain after close');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    expect(screen.queryByLabelText('Summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    expect(await screen.findByLabelText('Summary')).toHaveValue('Retain after close');
  });

  it('does not clear newer writing when an earlier submitted version succeeds', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    renderScoped(<TaskSummaryPanel taskId="a" />);
    await write('Submitted version');
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Newer writing' } });
    pending.resolve({ summary: { text: 'Submitted version', authorName: 'Ada', updatedAt: '2026-11-09T11:00:00Z' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(screen.getByLabelText('Summary')).toHaveValue('Newer writing');
    expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
  });

  it('keeps the original text as unsaved intent if reverted while a different save commits', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    renderScoped(<TaskSummaryPanel taskId="a" summary={original} />);
    await write('Submitted version', true);
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: original.text } });
    pending.resolve({ summary: { text: 'Submitted version', authorName: 'Ada', updatedAt: '2026-11-09T11:00:00Z' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(screen.getByLabelText('Summary')).toHaveValue(original.text);
    expect(screen.getByText('Unsaved draft')).toBeInTheDocument();
  });

  it('does not clear a cancelled and reopened entry when the previous save completes', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    renderScoped(<TaskSummaryPanel taskId="a" />);
    await write('Old entry');
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await write('Reopened entry');
    pending.resolve({ summary: { text: 'Old entry', authorName: 'Ada', updatedAt: '2026-11-09T11:00:00Z' } });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
    expect(screen.getByLabelText('Summary')).toHaveValue('Reopened entry');
  });

  it('admits only one per-task submission even before a disabled control rerenders', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    renderScoped(<TaskSummaryPanel taskId="a" />);
    await write('One submission');
    const form = screen.getByLabelText('Summary').closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(pending.requests.length).toBeGreaterThan(0));
    expect(pending.requests).toHaveLength(1);
    pending.resolve({});
  });

  it('keeps a failed save and its latest text visible after closing and reopening', async () => {
    mockRpcError(TaskService, 'SetTaskSummary', 'unavailable', 'Summary temporarily offline');
    function Task() { const [open, setOpen] = useState(true); return <><button onClick={() => setOpen(o => !o)}>Toggle task</button>{open && <TaskSummaryPanel taskId="a" />}</>; }
    renderScoped(<Task />);
    await write('Keep text and outcome');
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Summary temporarily offline');
    expect(screen.getByRole('alert')).not.toHaveTextContent('[unavailable]');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    expect(await screen.findByLabelText('Summary')).toHaveValue('Keep text and outcome');
    expect(screen.getByRole('alert')).toHaveTextContent('Summary temporarily offline');
  });

  it('excludes another save and Clear after route remount while the original save is pending', async () => {
    const pending = mockRpcPending(TaskService, 'SetTaskSummary');
    function Task() { const [open, setOpen] = useState(true); return <><button onClick={() => setOpen(o => !o)}>Toggle task</button>{open && <TaskSummaryPanel taskId="a" summary={original} />}</>; }
    const view = renderScoped(<Task />);
    await write('Only one write', true);
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle task' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText('Summary').closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(pending.requests).toHaveLength(1);
    pending.resolve({ summary: { text: 'Only one write', authorName: 'Ada', updatedAt: '' } });
    await waitFor(() => expect(view.queryClient.isMutating()).toBe(0));
  });
});
