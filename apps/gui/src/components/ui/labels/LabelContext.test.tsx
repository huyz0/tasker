import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelProvider } from './LabelContext';
import { LabelPicker } from './LabelPicker';

const { mockListLabels, mockListEntityLabels } = vi.hoisted(() => ({
  mockListLabels: vi.fn(),
  mockListEntityLabels: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({
    listLabels: mockListLabels,
    listEntityLabels: mockListEntityLabels,
    attachLabel: vi.fn(),
    detachLabel: vi.fn(),
    createLabel: vi.fn(),
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
    mockListEntityLabels.mockResolvedValue({ labels: [] });
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
});
