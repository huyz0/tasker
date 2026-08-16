import React from 'react';

/**
 * This was a bare `<button>` passthrough, so `frontend-standard.md` §1 —
 * "prefer explicit variants (`<Button variant="destructive">`) over boolean
 * props" — described an API that did not exist. Every consumer restyled a
 * button by hand, which is how the app ended up with square, unpadded controls.
 *
 * No `cva` dependency: two small maps do the same job for four variants.
 */
const VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border bg-background hover:bg-muted hover:text-foreground',
  ghost: 'hover:bg-muted hover:text-foreground',
  inverted: 'bg-foreground text-background hover:bg-foreground/90',
} as const;

const SIZES = {
  sm: 'h-8 px-3 text-xs',
  default: 'h-9 px-4 py-2',
  lg: 'h-10 px-6',
  icon: 'h-9 w-9',
} as const;

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export const Button = ({
  variant = 'default',
  size = 'default',
  className,
  children,
  ...props
}: ButtonProps) => (
  <button
    className={[
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
      // Colour is the only thing that changes on hover, so name it rather than
      // reaching for transition-all.
      //
      // Disabled is a dedicated muted look, not a fade of whatever variant
      // was chosen: `disabled:opacity-50` on `default` (bg-primary) rendered
      // as a pale lavender wash that a review flagged as indistinguishable
      // from broken — three real buttons (a create action, a save action, a
      // link action) all looked like they had failed to load rather than
      // like they were correctly waiting on required input.
      'transition-colors disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground',
      VARIANTS[variant],
      SIZES[size],
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </button>
);
