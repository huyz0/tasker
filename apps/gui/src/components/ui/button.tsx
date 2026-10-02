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
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary-subtle disabled:text-primary-subtle-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-destructive-subtle disabled:text-destructive-subtle-foreground',
  outline: 'border bg-background hover:bg-muted hover:text-foreground disabled:text-muted-foreground',
  ghost: 'hover:bg-muted hover:text-foreground disabled:text-muted-foreground',
  inverted: 'bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground',
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
      // Disabled is a per-variant look, not a fade and not one shared grey.
      //
      // `disabled:opacity-50` on `default` (bg-primary) rendered as a pale
      // lavender wash a review flagged as indistinguishable from broken: the
      // text faded with the fill, so nothing on it was legible. It was
      // replaced by `disabled:bg-muted`, which fixed legibility but erased
      // identity: an empty Sign in / Create / Set password form then showed a
      // grey button and no visible primary action at all.
      //
      // So each variant disables to its own *subtle token pair*: a primary
      // button becomes `primary-subtle` with `primary-subtle-foreground` text
      // (a destructive one, the destructive pair). Still recognisably the
      // primary action, clearly not pressable (no solid fill, no hover), and
      // unlike opacity the text is a real contrast-checked pair (design-lint
      // holds every subtle pair to AA 4.5:1 in both themes) even though WCAG
      // 1.4.3 exempts disabled controls.
      'transition-colors disabled:pointer-events-none',
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
