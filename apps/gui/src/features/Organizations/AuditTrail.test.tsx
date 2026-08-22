import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../../test/mockRpc';

import { AuditTrail } from './AuditTrail';

function renderPanel(orgId = 'org-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditTrail orgId={orgId} />
    </QueryClientProvider>,
  );
}

const event = (over: Record<string, any> = {}) => ({
  id: 'evt-1',
  orgId: 'org-1',
  subject: 'domain.agent.token_created',
  actorType: 'user',
  actorId: 'usr-1',
  requestId: 'req-abcdef123456',
  payload: '{}',
  occurredAt: '2026-08-20T10:00:00.000Z',
  ...over,
});

/** Registers ListAuditEvents and records every request it receives. */
function withListAuditEvents(response: object | ((body: any) => object)) {
  const requests: any[] = [];
  mockRpc(AuditService, 'ListAuditEvents', (body) => {
    requests.push(body);
    return typeof response === 'function' ? response(body) : response;
  });
  return requests;
}

describe('AuditTrail', () => {
  it('lists recorded events for the active organization', async () => {
    const requests = withListAuditEvents({ events: [event()], page: { totalCount: 1 } });
    renderPanel();

    await waitFor(() => expect(screen.getByText('agent · token created')).toBeDefined());
    expect(requests).toContainEqual(expect.objectContaining({ orgId: 'org-1' }));
  });

  it('strips the domain prefix, which is on every row and says nothing', async () => {
    withListAuditEvents({ events: [event({ subject: 'domain.org.member_removed' })], page: {} });
    renderPanel();
    await waitFor(() => expect(screen.getByText('org · member removed')).toBeDefined());
  });

  it('names a system event as system rather than leaving the actor blank', async () => {
    // "Nobody did this" is a real answer; an empty cell reads as a gap in the
    // record, which is the one thing an audit trail must not be ambiguous about.
    withListAuditEvents({
      events: [event({ actorType: 'system', actorId: undefined, requestId: undefined })],
      page: {},
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText('system')).toBeDefined());
  });

  it('shows who acted when there is an actor', async () => {
    withListAuditEvents({ events: [event()], page: {} });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/user: usr-1/)).toBeDefined());
  });

  it('filters by subject, and says so when nothing matches', async () => {
    const requests = withListAuditEvents({ events: [], page: {} });
    renderPanel();

    fireEvent.change(screen.getByLabelText('Filter by event'), {
      target: { value: 'domain.task.created' },
    });

    await waitFor(() =>
      expect(requests).toContainEqual(expect.objectContaining({ subject: 'domain.task.created' })),
    );
    await waitFor(() => expect(screen.getByText('No events match these filters.')).toBeDefined());
  });

  it('filters by actor', async () => {
    const requests = withListAuditEvents({ events: [], page: {} });
    renderPanel();

    fireEvent.change(screen.getByLabelText('Filter by actor'), { target: { value: 'usr-9' } });

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ actorId: 'usr-9' })));
  });

  it('distinguishes an empty trail from a filtered-to-nothing one', async () => {
    withListAuditEvents({ events: [], page: {} });
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText('Nothing has been recorded for this organization yet.')).toBeDefined(),
    );
  });

  it('surfaces a failed load instead of claiming the trail is empty', async () => {
    // The M06-T11 rule: a query error must not fall through to an empty state
    // that tells an administrator their history is gone.
    mockRpcError(AuditService, 'ListAuditEvents', 'permission_denied', 'permission denied');
    renderPanel();
    expect(await screen.findByText(/Could not load this list: .*permission denied/)).toBeDefined();
  });

  it('does not query at all when no organization is selected', async () => {
    const requests = withListAuditEvents({ events: [], page: {} });
    renderPanel('');
    await waitFor(() =>
      expect(screen.getByText('Nothing has been recorded for this organization yet.')).toBeDefined(),
    );
    expect(requests).toHaveLength(0);
  });

  it('pages through a long trail on request rather than fetching it all', async () => {
    // An audit trail only grows; loading every page on mount would make an
    // active organization's settings screen unusable.
    const requests = withListAuditEvents((body: { page?: { cursor?: string } }) =>
      body.page?.cursor
        ? { events: [event({ id: 'evt-2', subject: 'domain.task.deleted' })], page: { totalCount: 2 } }
        : {
            events: [event({ id: 'evt-1', subject: 'domain.task.created' })],
            page: { nextCursor: 'cursor-2', totalCount: 2 },
          },
    );
    renderPanel();

    await waitFor(() => expect(screen.getByText('task · created')).toBeDefined());
    expect(requests).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Load more/ }));

    await waitFor(() => expect(screen.getByText('task · deleted')).toBeDefined());
    expect(requests[requests.length - 1]).toEqual(
      expect.objectContaining({ page: { cursor: 'cursor-2' } }),
    );
  });

  it('lets a failed load be retried instead of stranding the reader', async () => {
    mockRpcError(AuditService, 'ListAuditEvents', 'unavailable', 'backend unreachable');
    renderPanel();

    expect(await screen.findByText(/backend unreachable/)).toBeDefined();
    withListAuditEvents({ events: [event()], page: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('agent · token created')).toBeDefined());
  });

  it('renders a subject with no action segment without mangling it', async () => {
    // Not every subject is "domain.<entity>.<action>". A bare one has no
    // action half to split off, and the row still has to say something.
    withListAuditEvents({ events: [event({ subject: 'domain.heartbeat' })], page: {} });
    renderPanel();
    await waitFor(() => expect(screen.getByText('heartbeat')).toBeDefined());
  });

  it('omits the request id when the event was not published during a request', async () => {
    // A retention sweep has no HTTP request behind it; showing "req " with
    // nothing after it would look like a truncation bug.
    withListAuditEvents({ events: [event({ requestId: undefined })], page: {} });
    renderPanel();
    await waitFor(() => expect(screen.getByText(/user: usr-1/)).toBeDefined());
    expect(screen.queryByText(/^req /)).toBeNull();
  });
});
