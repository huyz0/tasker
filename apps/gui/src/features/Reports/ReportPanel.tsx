import type { ReactNode } from 'react';
import { useScopedTo } from '../../hooks/useScope';
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
    <section className="border rounded-lg bg-surface-panel flex min-w-0 flex-col">
      <div className="p-panel border-b flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1 basis-64 wrap-anywhere">
          <h2 className="type-section-title">{title}</h2>
          <p className="type-caption text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {action && <div className="max-w-full min-w-0 shrink-0 wrap-anywhere">{action}</div>}
      </div>
      <div className="min-w-0 p-2 flex-1">{children}</div>
    </section>
  );
}

/**
 * Every task row on this screen is a way *in*: display id + title linking to
 * `/tasks/:id`, which auto-opens the detail view on that route.
 */
export function TaskLink({ taskId, displayId, title }: { taskId: string; displayId: string; title: string }) {
  const scopedTo = useScopedTo();
  return (
    <Link
      to={scopedTo(`/tasks/${taskId}`)}
      className="flex items-baseline gap-2 min-w-0 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <span className="type-code text-muted-foreground shrink-0">{displayId}</span>
      <span className="type-item-title truncate">{title}</span>
    </Link>
  );
}
