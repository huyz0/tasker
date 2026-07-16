import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListLabels, mockCreateLabel, mockUpdateLabel } = vi.hoisted(() => ({
  mockListLabels: vi.fn(),
  mockCreateLabel: vi.fn(),
  mockUpdateLabel: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ listLabels: mockListLabels, createLabel: mockCreateLabel, updateLabel: mockUpdateLabel })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  LabelService: {},
}));
vi.mock('../../store/layout', () => ({
  useLayoutStore: vi.fn((selector) => selector({
    setActivePageTitle: vi.fn(),
    activeOrgId: 'org-1',
  })),
}));

import { LabelsManager } from './index';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LabelsManager />
    </QueryClientProvider>
  );
}

describe('LabelsManager', () => {
  beforeEach(() => {
    mockListLabels.mockReset();
    mockCreateLabel.mockReset();
    mockUpdateLabel.mockReset();
  });

  it('lists existing labels for the active org', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
  });

  it('auto-loads later pages so labels past the first page are not hidden', async () => {
    mockListLabels
      .mockResolvedValueOnce({ labels: [{ id: 'lbl-1', name: 'Page One Label' }], page: { nextCursor: 'cursor-2' } })
      .mockResolvedValueOnce({ labels: [{ id: 'lbl-2', name: 'Page Two Label' }], page: {} });

    renderPage();

    await waitFor(() => expect(screen.getByText('Page One Label')).toBeDefined());
    await waitFor(() => expect(screen.getByText('Page Two Label')).toBeDefined());
    expect(mockListLabels).toHaveBeenCalledWith({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
  });

  it('shows an empty state when there are no labels', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet - create one above.')).toBeDefined());
  });

  it('creates a new label via the form', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    mockCreateLabel.mockResolvedValue({ label: { id: 'lbl-2', name: 'feature', color: '#3b82f6' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet - create one above.')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Label color'), { target: { value: '#ff00ff' } });
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(mockCreateLabel).toHaveBeenCalledWith({ orgId: 'org-1', name: 'feature', color: '#ff00ff' }));
  });

  it('shows an error message when creating a label fails', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    mockCreateLabel.mockRejectedValue(new Error('name already exists'));

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet - create one above.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Failed to create label: name already exists')).toBeDefined());
  });

  it('renders a label without a color using no inline style', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'uncolored' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('uncolored')).toBeDefined());
    expect(screen.getByText('uncolored').getAttribute('style')).toBeFalsy();
  });

  it('shows a pending label while creating a label', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    let resolveCreate: (v: any) => void = () => {};
    mockCreateLabel.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet - create one above.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    resolveCreate({ label: { id: 'lbl-2', name: 'feature', color: '#3b82f6' } });
  });

  it('edits a label name through the GUI', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    mockUpdateLabel.mockResolvedValue({ label: { id: 'lbl-1', name: 'defect', color: '#ff0000' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('bug');
    fireEvent.change(nameInput, { target: { value: 'defect' } });
    const colorInputs = screen.getAllByLabelText('Label color');
    fireEvent.change(colorInputs[colorInputs.length - 1], { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(mockUpdateLabel).toHaveBeenCalledWith({ labelId: 'lbl-1', name: 'defect', color: '#00ff00' }));
  });

  it('cancels editing a label without saving', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(mockUpdateLabel).not.toHaveBeenCalled();
  });

  it('shows an error message when updating a label fails', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    mockUpdateLabel.mockRejectedValue(new Error('name already exists in this organization'));

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update label/)).toBeInTheDocument());
  });
});
