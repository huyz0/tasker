import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabelService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';

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

/** Registers ListLabels and records every request it receives. */
function withListLabels(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(LabelService, 'ListLabels', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

/** Registers CreateLabel and records every request it receives. */
function withCreateLabel(response: object = { label: { id: 'lbl-2', name: 'feature', color: '#3b82f6' } }) {
  const requests: any[] = [];
  mockRpc(LabelService, 'CreateLabel', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers UpdateLabel and records every request it receives. */
function withUpdateLabel(response: object) {
  const requests: any[] = [];
  mockRpc(LabelService, 'UpdateLabel', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('LabelsManager', () => {
  it('lists existing labels for the active org', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
  });

  it('issues one request on mount, and pages the rest on request', async () => {
    // This replaces a test that asserted the view looped the cursor to
    // exhaustion on mount. That was the defect, not the contract: an
    // organization's label set has no bound, and a screen that cannot open
    // until the last page arrives is not more usable for having them all
    // (M07-T04).
    const requests = withListLabels((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { labels: [{ id: 'lbl-2', name: 'Page Two Label' }], page: { totalCount: 2 } }
        : { labels: [{ id: 'lbl-1', name: 'Page One Label' }], page: { nextCursor: 'cursor-2', totalCount: 2 } },
    );

    renderPage();
    await waitFor(() => expect(screen.getByText('Page One Label')).toBeDefined());
    expect(requests).toHaveLength(1);
    expect(screen.queryByText('Page Two Label')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));
    await waitFor(() => expect(screen.getByText('Page Two Label')).toBeDefined());
    expect(requests[requests.length - 1]).toEqual({ orgId: 'org-1', page: { cursor: 'cursor-2' } });
    // The first page is still on screen: pages accumulate.
    expect(screen.getByText('Page One Label')).toBeDefined();
  });

  it('surfaces a failed load with a way to retry, instead of an empty list', async () => {
    mockRpcError(LabelService, 'ListLabels', 'unavailable', 'connection refused');
    renderPage();

    await waitFor(() => expect(screen.getByText(/Could not load this list/)).toBeInTheDocument());
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('bug')).toBeInTheDocument());
  });

  it('does not offer Load more when the label list is complete', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'only' }], page: {} });
    renderPage();
    await waitFor(() => expect(screen.getByText('only')).toBeDefined());
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('shows an empty state when there are no labels', async () => {
    withListLabels({ labels: [] });

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels yet.')).toBeDefined());
  });

  it('creates a new label via the form', async () => {
    withListLabels({ labels: [] });
    const requests = withCreateLabel();

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels yet.')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Label color'), { target: { value: '#ff00ff' } });
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(requests).toContainEqual({ orgId: 'org-1', name: 'feature', color: '#ff00ff' }));
  });

  it('shows an error message when creating a label fails', async () => {
    withListLabels({ labels: [] });
    mockRpcError(LabelService, 'CreateLabel', 'unknown', 'name already exists');

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels yet.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'dup' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText(/Failed to create label:.*name already exists/)).toBeDefined());
  });

  it('renders a label without a color using no inline style', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'uncolored' }] });

    renderPage();

    await waitFor(() => expect(screen.getByText('uncolored')).toBeDefined());
    expect(screen.getByText('uncolored').getAttribute('style')).toBeFalsy();
  });

  it('shows a pending label while creating a label', async () => {
    withListLabels({ labels: [] });
    const pending = mockRpcPending(LabelService, 'CreateLabel');

    renderPage();

    await waitFor(() => expect(screen.getByText('No labels yet.')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Label name'), { target: { value: 'feature' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(screen.getByText('Creating...')).toBeInTheDocument());
    pending.resolve({ label: { id: 'lbl-2', name: 'feature', color: '#3b82f6' } });
  });

  it('edits a label name through the GUI', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    const requests = withUpdateLabel({ label: { id: 'lbl-1', name: 'defect', color: '#ff0000' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = screen.getByDisplayValue('bug');
    fireEvent.change(nameInput, { target: { value: 'defect' } });
    const colorInputs = screen.getAllByLabelText('Label color');
    fireEvent.change(colorInputs[colorInputs.length - 1], { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(requests).toContainEqual({ labelId: 'lbl-1', name: 'defect', color: '#00ff00' }));
  });

  it('cancels editing a label without saving', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    const requests = withUpdateLabel({ label: { id: 'lbl-1', name: 'bug', color: '#ff0000' } });

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByDisplayValue('bug')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows an error message when updating a label fails', async () => {
    withListLabels({ labels: [{ id: 'lbl-1', name: 'bug', color: '#ff0000' }] });
    mockRpcError(LabelService, 'UpdateLabel', 'unknown', 'name already exists in this organization');

    renderPage();

    await waitFor(() => expect(screen.getByText('bug')).toBeDefined());
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(screen.getByText(/Failed to update label/)).toBeInTheDocument());
  });
});
