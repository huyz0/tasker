import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * The shell every Reports card sits in — the Dashboard's Panel shape (h2
 * title, one-line subtitle naming the decision the card feeds, optional
 * action slot), shared here because four sibling cards would otherwise carry
 * four copies of it.
 */
export function ReportPanel({ title, subtitle, action, children }: {
  title: string;
  /** The decision this card feeds — every panel must name one. */
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border rounded-lg bg-card shadow-sm flex flex-col">
      <div className="p-4 border-b flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="p-2 flex-1">{children}</div>
    </section>
  );
}

/**
 * Every task row on this screen is a way *in*: display id + title linking to
 * `/tasks/:id`, which auto-opens the detail view on that route.
 */
export function TaskLink({ taskId, displayId, title }: { taskId: string; displayId: string; title: string }) {
  return (
    <Link
      to={`/tasks/${taskId}`}
      className="flex items-baseline gap-2 min-w-0 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className="font-mono text-xs text-muted-foreground shrink-0">{displayId}</span>
      <span className="text-sm font-medium truncate">{title}</span>
    </Link>
  );
}
