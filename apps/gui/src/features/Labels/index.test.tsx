import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListLabels, mockCreateLabel } = vi.hoisted(() => ({
  mockListLabels: vi.fn(),
  mockCreateLabel: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ listLabels: mockListLabels, createLabel: mockCreateLabel })),
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
  });

  it('lists existing labels for the active org', async () => {
    mockListLabels.mockResolvedValue({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
  });

  it('shows an empty state when there are no labels', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet.')).toBeDefined());
  });

  it('creates a new label via the form', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    mockCreateLabel.mockResolvedValue({ label: { id: 'lbl-2', name: 'feature', color: '#3b82f6' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(mockCreateLabel).toHaveBeenCalledWith({ orgId: 'org-1', name: 'feature', color: '#3b82f6' }));
  });

  it('shows an error message when creating a label fails', async () => {
    mockListLabels.mockResolvedValue({ labels: [] });
    mockCreateLabel.mockRejectedValue(new Error('name already exists'));

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels created yet.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Failed to create label: name already exists')).toBeDefined());
  });
});
