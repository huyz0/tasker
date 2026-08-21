import type { LiveStatus } from '../../hooks/useLiveEvents';

/**
 * Whether the screen is currently being kept up to date (M08-T10).
 *
 * Purely presentational — the connection itself is owned by `AppShell`, which
 * holds one `useLiveEvents` for the whole app and passes the status down.
 * Rendering the hook here instead would open a second stream for every place
 * the indicator appears.
 *
 * The interesting states are the unhappy ones. A connected app should not
 * spend header space telling you so, so `live` is a bare dot and everything
 * else earns a word.
 */

const PRESENTATION: Record<LiveStatus, { dot: string; label: string; pulse: boolean }> = {
  connecting: { dot: 'bg-muted-foreground', label: 'Connecting…', pulse: true },
  live: { dot: 'bg-success', label: 'Live', pulse: false },
  reconnecting: { dot: 'bg-warning', label: 'Reconnecting…', pulse: true },
  // Not "disconnected": the screen is still updating, just slowly. Saying
  // "offline" alone would suggest the data on it has stopped being true.
  offline: { dot: 'bg-destructive', label: 'Refreshing periodically', pulse: false },
};

export function LiveStatusIndicator({ status }: { status: LiveStatus }) {
  const { dot, label, pulse } = PRESENTATION[status];

  return (
    <div
      // A polite live region: a connection dropping is worth announcing, but
      // not worth interrupting whatever the user is reading.
      role="status"
      aria-live="polite"
      data-testid="live-status"
      data-status={status}
      title={label}
      className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`}
      />
      {/* The label is the whole message for a screen reader, and only shows
          visually when there is room — the 375px header budget (UX-F1) has
          none to spare, and a coloured dot carries the state on its own. */}
      <span className={status === 'live' ? 'sr-only' : 'sr-only sm:not-sr-only sm:truncate'}>
        {label}
      </span>
    </div>
  );
}
