import type { ReactNode } from 'react';

/**
 * The top of every routed screen: one `h1`, an optional line saying what the
 * screen is for, and the screen's primary actions.
 *
 * Each screen used to write its own. Seven used `text-3xl`, four used
 * `text-lg` inside an extra `p-4` wrapper (so their gutter sat ~16px further
 * in than the rest), two had no `h1` at all, and two put an icon in front of
 * the title that no other screen had. Moving between pages, the title jumped
 * size and position — the clearest sign the screens were built separately.
 *
 * `main` already supplies the page gutter (AppShell), so this adds none.
 */
export function PageHeader({
  title,
  description,
  actions,
  toolbar,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Filters and view controls grow on their own row rather than squeezing the title. */
  toolbar?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="type-page-title">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex min-h-control flex-wrap items-center gap-3 md:shrink-0">{actions}</div>}
      </div>
      {toolbar && <div className="flex min-w-0 flex-wrap items-center gap-3">{toolbar}</div>}
    </div>
  );
}
