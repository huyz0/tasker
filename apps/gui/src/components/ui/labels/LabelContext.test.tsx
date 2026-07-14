import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelProvider, useLabels } from './LabelContext';
import { LabelPicker } from './LabelPicker';
import { LabelChips } from './LabelChips';

const { mockListLabels, mockListEntityLabels, mockAttachLabel, mockCreateLabel, mockDetachLabel } = vi.hoisted(() => ({
  mockListLabels: vi.fn(),
  mockListEntityLabels: vi.fn(),
  mockAttachLabel: vi.fn(),
  mockCreateLabel: vi.fn(),
  mockDetachLabel: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listLabels: mockListLabels,
    listEntityLabels: mockListEntityLabels,
    attachLabel: mockAttachLabel,
    detachLabel: mockDetachLabel,
    createLabel: mockCreateLabel,
  })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({ LabelService: {} }));

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
  beforeEach(() => {
    mockListLabels.mockReset();
    mockListEntityLabels.mockReset();
    mockAttachLabel.mockReset();
    mockCreateLabel.mockReset();
    mockListEntityLabels.mockResolvedValue({ labels: [] });
    mockListLabels.mockResolvedValue({ labels: [] });
  });

  it('auto-loads later pages so labels past the first page are selectable', async () => {
    mockListLabels
      .mockResolvedValueOnce({ labels: [{ id: 'lbl-1', name: 'Page One Label' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ labels: [{ id: 'lbl-2', name: 'Page Two Label' }], page: {} });

    renderPicker();

    await waitFor(() => expect(screen.getByText('Page One Label')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Label')).toBeDefined());
    expect(mockListLabels).toHaveBeenCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });

  it('does not show the attach dropdown when there are no unattached labels', async () => {
    renderPicker();
    await waitFor(() => expect(mockListLabels).toHaveBeenCalled());
    expect(screen.queryByText('Attach a label...')).not.toBeInTheDocument();
  });

  it('attaches a label selected from the dropdown', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    mockAttachLabel.mockResolvedValue({ success: true });
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lbl-1' } });

    await waitFor(() => expect(mockAttachLabel).toHaveBeenCalledWith({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-1' }));
  });

  it('creates and attaches a new label from the form, then clears the input', async () => {
    mockCreateLabel.mockResolvedValue({ label: { id: 'lbl-new', name: 'feature' } });
    mockAttachLabel.mockResolvedValue({ success: true });
    renderPicker();
    await waitFor(() => expect(mockListLabels).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('New label name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'feature' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create & attach' }).closest('form')!);

    await waitFor(() => expect(mockCreateLabel).toHaveBeenCalledWith({ orgId: 'org-1', name: 'feature', color: '' }));
    await waitFor(() => expect(mockAttachLabel).toHaveBeenCalledWith({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-new' }));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('does not submit the create form when the label name is blank or whitespace', async () => {
    renderPicker();
    await waitFor(() => expect(mockListLabels).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('New label name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create & attach' }));

    expect(mockCreateLabel).not.toHaveBeenCalled();
  });

  it('shows an error message when a mutation fails', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    mockAttachLabel.mockRejectedValue(new Error('label already attached'));
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lbl-1' } });

    await waitFor(() => expect(screen.getByText(/Failed to update labels/)).toBeInTheDocument());
    expect(screen.getByText(/label already attached/)).toBeInTheDocument();
  });

  it('does not fetch available labels when there is no org id', async () => {
    mockListEntityLabels.mockResolvedValue({ labels: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LabelProvider entityId="task-1" entityType="task" orgId="">
          <LabelPicker />
        </LabelProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(mockListEntityLabels).toHaveBeenCalled());
    expect(mockListLabels).not.toHaveBeenCalled();
  });

  it('ignores selecting the placeholder option in the attach dropdown', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug' }], page: {} });
    renderPicker();

    await waitFor(() => expect(screen.getByText('Attach a label...')).toBeInTheDocument());
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    expect(mockAttachLabel).not.toHaveBeenCalled();
  });

  it('does not create a label when the form is submitted with a whitespace-only name', async () => {
    renderPicker();
    await waitFor(() => expect(mockListLabels).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('New label name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);

    expect(mockCreateLabel).not.toHaveBeenCalled();
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
    mockListEntityLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug' }] });
    mockListLabels.mockResolvedValue({ labels: [] });
    mockDetachLabel.mockResolvedValue({ success: true });

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

    await waitFor(() => expect(mockDetachLabel).toHaveBeenCalledWith({ entityId: 'task-1', entityType: 'task', labelId: 'lbl-1' }));
  });

  it('does not attach when label creation succeeds without returning a label', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    mockCreateLabel.mockResolvedValue({ label: undefined });
    renderPicker();
    await waitFor(() => expect(mockListLabels).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('New label name'), { target: { value: 'feature' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create & attach' }).closest('form')!);

    await waitFor(() => expect(mockCreateLabel).toHaveBeenCalled());
    expect(mockAttachLabel).not.toHaveBeenCalled();
  });
});
