import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** Omitted for the current page, which is not a link to itself. */
  to?: string;
}

/**
 * The path back out of a detail view.
 *
 * A detail view reached by a deep link has no history to go back through — the
 * browser's Back button leaves the app entirely. Breadcrumbs are the only way
 * out that works whether the user clicked in from the board or pasted a URL.
 *
 * The last crumb is the current page: rendered as text, not a link, and marked
 * `aria-current="page"`. A link to the page you are already on is a control
 * that appears to do nothing.
 */
export function Breadcrumbs({ items, className = '' }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
              {item.to && !isLast ? (
                <Link
                  to={item.to}
                  className="truncate hover:text-foreground underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-foreground" aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
