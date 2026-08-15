import type { ReactNode } from 'react';

/**
 * What a list shows when it has nothing to show.
 *
 * Every view surfaced its *mutation* errors and almost none surfaced its
 * *query* errors: when the list request failed, the view fell through to its
 * empty state and said "No projects found". That is not a blank region, it is a
 * confident lie — the user is told their data is gone when the request never
 * arrived, and there is nothing to click to find out otherwise (M06-T11).
 *
 * The three states are deliberately one component, because the bug was that
 * they were three separate conditionals and the middle one kept being left out.
 */
export function ListState({
  isLoading,
  error,
  isEmpty,
  loadingMessage = 'Loading…',
  emptyMessage,
  emptyAction,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  loadingMessage?: string;
  /** What this list would hold, and why it is empty. */
  emptyMessage: string;
  /** The way out of an empty list — usually the control that fills it. */
  emptyAction?: ReactNode;
  /** Refetch. Without it a failed list is a dead end until a full reload. */
  onRetry?: () => void;
  /** Rendered when there is something to show. */
  children?: ReactNode;
}) {
  if (isLoading) {
    return <p className="p-4 text-sm text-center text-muted-foreground">{loadingMessage}</p>;
  }

  if (error) {
    return (
      <div role="alert" className="p-4 rounded-md bg-destructive-subtle text-destructive-subtle-foreground text-sm flex flex-col items-center gap-2">
        {/* The server's own words. "Something went wrong" tells a user nothing
            they can act on and nothing they can report. */}
        <p>Could not load this list: {(error as Error)?.message ?? 'the request failed'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 rounded-md border border-current text-sm font-medium hover:opacity-80"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="p-4 text-sm text-center text-muted-foreground flex flex-col items-center gap-2">
        <p>{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return <>{children}</>;
}
