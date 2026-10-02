import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { NotificationService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { renderScoped } from '../../test/renderScoped';
import { mockRpc, mockRpcError } from '../../test/mockRpc';
import { NotificationBell } from './NotificationBell';

/**
 * M29-T06. Every assertion here goes through the real generated client and
 * the real transport (`mockRpc` intercepts fetch, not `createClient`), so a
 * component that read a field the contract does not have would fail here
 * rather than agree with a hand-written stub.
 */

const ORG = 'org-1';

function notification(over: Partial<any> = {}) {
  return {
    id: 'ntf-1',
    type: 'task.stalled',
    title: 'T-14 — Wire the thing',
    body: "Builder's claim has been silent for 30 hours.",
    targetPath: '/tasks/tsk-14?org=org-1&project=proj-1',
    orgId: ORG,
    projectId: 'proj-1',
    createdAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    ...over,
  };
}

beforeEach(() => {
  mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 0 });
  mockRpc(NotificationService, 'ListNotifications', { notifications: [] });
});

describe('NotificationBell', () => {
  it('shows no badge when nothing is unread', async () => {
    renderScoped(<NotificationBell orgId={ORG} />);
    await waitFor(() => expect(screen.getByTestId('notification-bell')).toBeInTheDocument());
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument();
  });

  it('shows the unread count, and puts it in the accessible name too', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 3 });
    renderScoped(<NotificationBell orgId={ORG} />);

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('3'));
    // A badge is a visual affordance; the count has to reach a screen reader
    // by some route that is not colour and position.
    expect(screen.getByRole('button', { name: /3 unread/i })).toBeInTheDocument();
  });

  it('caps the badge but not the accessible name', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 42 });
    renderScoped(<NotificationBell orgId={ORG} />);

    await waitFor(() => expect(screen.getByTestId('notification-badge')).toHaveTextContent('9+'));
    // "9+" is not a number. The real one is still available on request.
    expect(screen.getByRole('button', { name: /42 unread/i })).toBeInTheDocument();
  });

  it('does not fetch the list until the panel is opened', async () => {
    let listCalls = 0;
    mockRpc(NotificationService, 'ListNotifications', () => {
      listCalls++;
      return { notifications: [] };
    });
    renderScoped(<NotificationBell orgId={ORG} />);
    await waitFor(() => expect(screen.getByTestId('notification-bell')).toBeInTheDocument());

    // The bell is on every screen; pulling a page of notifications nobody
    // looked at would be a request per navigation.
    expect(listCalls).toBe(0);

    fireEvent.click(screen.getByTestId('notification-bell'));
    await waitFor(() => expect(listCalls).toBe(1));
  });

  it('lists notifications with the server-rendered title and body', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 1 });
    mockRpc(NotificationService, 'ListNotifications', { notifications: [notification()] });

    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    const panel = await screen.findByTestId('notification-panel');
    expect(await within(panel).findByText('T-14 — Wire the thing')).toBeInTheDocument();
    expect(within(panel).getByText(/silent for 30 hours/)).toBeInTheDocument();
  });

  it('says so when there is nothing, rather than showing an empty box', async () => {
    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    expect(await screen.findByText('Nothing needs your attention.')).toBeInTheDocument();
  });

  it('surfaces a failed list instead of claiming there is nothing', async () => {
    mockRpcError(NotificationService, 'ListNotifications', 'unavailable', 'backend down');
    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    // The M06-T11 bug: a failed query falling through to "nothing here" is a
    // confident lie about the user's data.
    await waitFor(() => {
      expect(screen.queryByText('Nothing needs your attention.')).not.toBeInTheDocument();
    });
  });

  it('navigates to the notification target, scope included', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 1 });
    mockRpc(NotificationService, 'ListNotifications', { notifications: [notification()] });
    mockRpc(NotificationService, 'MarkNotificationRead', { notification: notification({ readAt: new Date().toISOString() }) });

    const { location } = renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(await screen.findByText('T-14 — Wire the thing'));

    // ADR-0025: without the query string this reopens under whatever project
    // the reader happened to have selected.
    await waitFor(() => expect(location.pathname).toBe('/tasks/tsk-14'));
    expect(location.search).toContain('org=org-1');
    expect(location.search).toContain('project=proj-1');
  });

  it('marks a notification read when it is opened', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 1 });
    mockRpc(NotificationService, 'ListNotifications', { notifications: [notification()] });
    let markedId: string | null = null;
    mockRpc(NotificationService, 'MarkNotificationRead', (body: any) => {
      markedId = body.id;
      return { notification: notification({ readAt: new Date().toISOString() }) };
    });

    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(await screen.findByText('T-14 — Wire the thing'));

    await waitFor(() => expect(markedId).toBe('ntf-1'));
  });

  it('does not re-mark one that is already read', async () => {
    const read = notification({ readAt: new Date().toISOString() });
    mockRpc(NotificationService, 'ListNotifications', { notifications: [read] });
    let markCalls = 0;
    mockRpc(NotificationService, 'MarkNotificationRead', () => {
      markCalls++;
      return { notification: read };
    });

    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(await screen.findByText('T-14 — Wire the thing'));

    await waitFor(() => expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument());
    expect(markCalls).toBe(0);
  });

  it('offers "mark all read" only when something is unread', async () => {
    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    await screen.findByTestId('notification-panel');
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('marks everything read on request', async () => {
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 2 });
    mockRpc(NotificationService, 'ListNotifications', { notifications: [notification()] });
    let called = false;
    mockRpc(NotificationService, 'MarkAllNotificationsRead', () => {
      called = true;
      return { markedCount: 2 };
    });

    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    fireEvent.click(await screen.findByRole('button', { name: /mark all read/i }));

    await waitFor(() => expect(called).toBe(true));
  });

  it('closes on Escape', async () => {
    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));
    await screen.findByTestId('notification-panel');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument());
  });

  it('closes when the user clicks elsewhere on the page (M32-T07)', async () => {
    // A popover, not a modal: clicking away is how it is dismissed. It used to
    // stay open over whatever the user clicked next.
    renderScoped(<><NotificationBell orgId={ORG} /><p>elsewhere</p></>);
    fireEvent.click(screen.getByTestId('notification-bell'));
    const panel = await screen.findByTestId('notification-panel');

    fireEvent.pointerDown(panel);
    expect(screen.getByTestId('notification-panel')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('elsewhere'));
    await waitFor(() => expect(screen.queryByTestId('notification-panel')).not.toBeInTheDocument());
  });

  it('renders whatever type the server sends, without knowing what it is', async () => {
    // The milestone's own exit criterion, from the component's side: a type
    // this file has never heard of renders identically, because the server
    // rendered it.
    mockRpc(NotificationService, 'GetUnreadNotificationCount', { count: 1 });
    mockRpc(NotificationService, 'ListNotifications', {
      notifications: [notification({
        id: 'ntf-h',
        type: 'task.handoff',
        title: 'T-9 handed off to you',
        body: 'Alice left a handoff note.',
      })],
    });

    renderScoped(<NotificationBell orgId={ORG} />);
    fireEvent.click(screen.getByTestId('notification-bell'));

    expect(await screen.findByText('T-9 handed off to you')).toBeInTheDocument();
    expect(screen.getByText('Alice left a handoff note.')).toBeInTheDocument();
  });
});
