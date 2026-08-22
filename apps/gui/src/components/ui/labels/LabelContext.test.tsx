import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../../test/mockRpc';
import { LabelProvider, useLabels } from './LabelContext';
import { LabelPicker } from './LabelPicker';
import { LabelChips } from './LabelChips';

/** Registers ListLabels and records every request it receives. */
function withListLabels(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(LabelService, 'ListLabels', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers AttachLabel and records every request it receives. */
function withAttachLabel(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(LabelService, 'AttachLabel', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers CreateLabel and records every request it receives. */
function withCreateLabel(response: object) {
  const requests: any[] = [];
  mockRpc(LabelService, 'CreateLabel', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

function renderPicker() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LabelProvider entityId="task-1" entityType="task" orgId="org-1">
        <LabelPicker />
      </LabelProvider>
    </QueryClientProvider>
  );
}

describe('LabelProvider', () => {
  it('auto-loads later pages so labels past the first page are selectable', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    const requests = withListLabels((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { labels: [{ id: 'lbl-2', name: 'Page Two Label' }], page: {} }
        : { labels: [{ id: 'lbl-1', name: 'Page One Label' }], page: { nextCursor: 'cursor-2' } },
    );

    renderPicker();

    await waitFor(() => expect(screen.getByText('Page One Label')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Label')).toBeDefined());
    expect(requests).toContainEqual({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });

  it('does not show the attach dropdown when there are no unattached labels', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    const requests = withListLabels({ labels: [] });
    renderPicker();
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(screen.queryByText('Attach a label...')).not.toBeInTheDocument();
  });

  it('attaches a label selected from the dropdown', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    const requests = withAttachLabel();
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lbl-1' } });

    await waitFor(() => expect(requests).toContainEqual({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-1' }));
  });

  it('creates and attaches a new label from the form, then clears the input', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [] });
    const createRequests = withCreateLabel({ label: { id: 'lbl-new', name: 'feature' } });
    const attachRequests = withAttachLabel();
    renderPicker();
    await waitFor(() => expect(screen.getByPlaceholderText('New label name')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('New label name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'feature' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create & attach' }).closest('form')!);

    // An empty `color` is proto3's default for a string field, so the real
    // JSON codec omits it from the wire rather than sending ''.
    await waitFor(() => expect(createRequests).toContainEqual({ orgId: 'org-1', name: 'feature' }));
    await waitFor(() => expect(attachRequests).toContainEqual({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-new' }));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('does not submit the create form when the label name is blank or whitespace', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [] });
    const createRequests = withCreateLabel({ label: { id: 'lbl-new', name: 'feature' } });
    renderPicker();
    await waitFor(() => expect(screen.getByPlaceholderText('New label name')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('New label name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create & attach' }));

    expect(createRequests).toHaveLength(0);
  });

  it('shows an error message when a mutation fails', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    mockRpcError(LabelService, 'AttachLabel', 'unknown', 'label already attached');
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lbl-1' } });

    await waitFor(() => expect(screen.getByText(/Failed to update labels/)).toBeInTheDocument());
    expect(screen.getByText(/label already attached/)).toBeInTheDocument();
  });

  it('does not fetch available labels when there is no org id', async () => {
    const entityRequests: any[] = [];
    mockRpc(LabelService, 'ListEntityLabels', (body) => {
      entityRequests.push(body);
      return { labels: [] };
    });
    const requests = withListLabels({ labels: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LabelProvider entityId="task-1" entityType="task" orgId="">
          <LabelPicker />
        </LabelProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(entityRequests.length).toBeGreaterThan(0));
    expect(requests).toHaveLength(0);
  });

  it('ignores selecting the placeholder option in the attach dropdown', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    const requests = withAttachLabel();
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(requests).toHaveLength(0);
  });

  it('does not create a label when the form is submitted with a whitespace-only name', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [] });
    const requests = withCreateLabel({ label: { id: 'lbl-new', name: 'feature' } });
    renderPicker();
    await waitFor(() => expect(screen.getByPlaceholderText('New label name')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('New label name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(requests).toHaveLength(0);
  });

  it('throws when useLabels is called outside of a LabelProvider', () => {
    function Consumer() {
      useLabels();
      return null;
    }
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow('useLabels must be used within a LabelProvider');
    spy.mockRestore();
  });

  it('detaches an attached label through the real provider', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [{ id: 'lbl-1', name: 'bug' }] });
    withListLabels({ labels: [] });
    const requests: any[] = [];
    mockRpc(LabelService, 'DetachLabel', (body) => {
      requests.push(body);
      return { success: true };
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LabelProvider entityId="task-1" entityType="task" orgId="org-1">
          <LabelChips />
        </LabelProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('bug')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remove label bug' }));

    await waitFor(() => expect(requests).toContainEqual({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-1' }));
  });

  it('does not attach when label creation succeeds without returning a label', async () => {
    mockRpc(LabelService, 'ListEntityLabels', { labels: [] });
    withListLabels({ labels: [] });
    const createRequests = withCreateLabel({});
    const attachRequests = withAttachLabel();
    renderPicker();
    await waitFor(() => expect(screen.getByPlaceholderText('New label name')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('New label name'), { target: { value: 'feature' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create & attach' }).closest('form')!);

    await waitFor(() => expect(createRequests.length).toBeGreaterThan(0));
    expect(attachRequests).toHaveLength(0);
  });
});
