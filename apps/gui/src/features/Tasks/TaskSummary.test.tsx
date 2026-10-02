import { describe, it, expect } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { TaskService, TaskSummarySchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { renderScoped } from '../../test/renderScoped';
import { TaskSummaryPanel } from './TaskSummary';

const summary = create(TaskSummarySchema, { text: 'Shipped behind a **flag**.', authorName: 'Closer', updatedAt: '2026-10-02T10:00:00Z' });

describe('TaskSummaryPanel (M41)', () => {
  it('invites a summary when there is none, and saves one', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'SetTaskSummary', (body) => { requests.push(body); return { summary: { text: body.text, authorName: 'Ada', updatedAt: '' } }; });
    renderScoped(<TaskSummaryPanel taskId="t-1" />);
    expect(screen.getByText(/No summary yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Write a summary' }));
    const save = screen.getByRole('button', { name: 'Save summary' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Done; see the flag.' } });
    expect(screen.getByText('19 / 4000')).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(requests).toEqual([{ taskId: 't-1', text: 'Done; see the flag.' }]));
    await waitFor(() => expect(screen.queryByLabelText('Summary')).toBeNull());
  });

  it('shows the summary with its author, edits it, and cancels', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'SetTaskSummary', (body) => { requests.push(body); return {}; });
    renderScoped(<TaskSummaryPanel taskId="t-1" summary={summary} />);
    expect(screen.getByText('flag')).toBeInTheDocument();
    expect(screen.getByText(/By Closer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Summary')).toHaveValue('Shipped behind a **flag**.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Summary')).toBeNull();
    expect(requests).toEqual([]);
  });

  it('refuses an over-long summary and clears one', async () => {
    const requests: any[] = [];
    mockRpc(TaskService, 'SetTaskSummary', (body) => { requests.push(body); return {}; });
    renderScoped(<TaskSummaryPanel taskId="t-1" summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'x'.repeat(4001) } });
    expect(screen.getByText('4001 / 4000')).toHaveClass('text-destructive');
    expect(screen.getByRole('button', { name: 'Save summary' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(requests).toEqual([{ taskId: 't-1' }]));
  });

  it('reports a failed save and a failed clear', async () => {
    mockRpcError(TaskService, 'SetTaskSummary', 'permission_denied', 'viewers cannot write');
    renderScoped(<TaskSummaryPanel taskId="t-1" summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText(/Failed to clear the summary: .*viewers cannot write/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save summary' }));
    expect(await screen.findByText(/Failed to save the summary: .*viewers cannot write/)).toBeInTheDocument();
  });
});
