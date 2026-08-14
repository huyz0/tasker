import React from 'react';

/**
 * These were bare `<div>` passthroughs with no styling at all, so every card in
 * the app got its border, padding and radius from whatever the consumer
 * remembered to pass — and the login card, the only consumer, had none. The
 * result was a title, a subtitle and a button touching each other with no
 * boundary, which a screenshot showed immediately and no test could.
 *
 * Styling belongs in the primitive: `design-system.md` §4 puts generic
 * components here precisely so a consumer does not re-derive the card.
 * Consumer classes are appended last so they can still override.
 */
const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

export const Card = ({ className, children, ...props }: React.ComponentProps<'div'>) => (
  <div className={join('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props}>
    {children}
  </div>
);

export const CardHeader = ({ className, children, ...props }: React.ComponentProps<'div'>) => (
  <div className={join('flex flex-col space-y-1.5 p-6', className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...props }: React.ComponentProps<'h3'>) => (
  <h3 className={join('text-xl font-medium leading-none tracking-tight', className)} {...props}>
    {children}
  </h3>
);

export const CardContent = ({ className, children, ...props }: React.ComponentProps<'div'>) => (
  <div className={join('p-6 pt-0', className)} {...props}>
    {children}
  </div>
);
