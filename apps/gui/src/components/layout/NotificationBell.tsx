import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { NotificationService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { transport } from '../../lib/connectTransport';
import { useFocusTrap } from '../ui/useFocusTrap';
import { ListState } from '../ui/ListState';

/**
 * The in-app notification surface (M29-T06).
 *
 * **It renders what the server rendered.** `title`, `body` and `targetPath`
 * arrive already composed by `lib/notificationRegistry.ts`, and nothing here
 * branches on `type`. That is the whole point of the milestone: a handoff or
 * review-request notification registers a renderer on the backend and appears
 * in this list without this file changing. If you find yourself adding
 * `if (n.type === …)` below, stop — the generic path exists.
 *
 * Fed the org id rather than reading the layout store, matching
 * `LiveStatusIndicator`'s split: the shell owns scope, the component renders.
 * That also keeps it trivially storyable at any state.
 */

const client = createClient(NotificationService, transport);

/** Shown instead of a precise count once it stops being worth reading. */
const BADGE_CAP = 9;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useFocusTrap(panelRef, open, () => setOpen(false));

  // The badge is cheap and always mounted; the list is only fetched once the
  // panel is opened, so a header on every screen does not pull a page of
  // notifications nobody looked at.
  const countQuery = useQuery({
    queryKey: ['notificationCount', orgId],
    queryFn: () => client.getUnreadNotificationCount({ orgId }),
    enabled: Boolean(orgId),
  });

  const listQuery = useQuery({
    queryKey: ['notifications', orgId],
    queryFn: () => client.listNotifications({ orgId, page: { limit: 20 } }),
    enabled: Boolean(orgId) && open,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['notificationCount'] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => client.markNotificationRead({ id }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => client.markAllNotificationsRead({ orgId }),
    onSuccess: invalidate,
  });

  const unread = countQuery.data?.count ?? 0;
  const items = listQuery.data?.notifications ?? [];

  function openNotification(n: { id: string; targetPath?: string; readAt?: string }) {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    // The path already carries its own scope (ADR-0025), so this lands in the
    // right org and project regardless of what the reader had selected.
    if (n.targetPath) navigate(n.targetPath);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Count in the label, not only in the badge: the badge is a visual
        // affordance and "9+" is not a number a screen reader should read as
        // the whole truth.
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        data-testid="notification-bell"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            data-testid="notification-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
          >
            {unread > BADGE_CAP ? `${BADGE_CAP}+` : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h2 className="text-sm font-medium">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            <ListState
              isLoading={listQuery.isLoading}
              error={listQuery.error}
              isEmpty={items.length === 0}
              loadingMessage="Loading notifications…"
              emptyMessage="Nothing needs your attention."
              onRetry={() => void listQuery.refetch()}
            >
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={`w-full px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${n.readAt ? '' : 'bg-accent/30'}`}
                    >
                      <span className="flex items-start gap-2">
                        {!n.readAt && (
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <span className={`min-w-0 flex-1 ${n.readAt ? 'pl-3.5' : ''}`}>
                          <span className="block truncate text-sm font-medium">{n.title}</span>
                          <span className="block text-xs text-muted-foreground">{n.body}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {relativeTime(n.createdAt)}
                            {!n.readAt && <span className="sr-only"> — unread</span>}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ListState>
          </div>
        </div>
      )}
    </div>
  );
}
