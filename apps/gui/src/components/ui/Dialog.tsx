import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { createPortal } from 'react-dom';

/**
 * The one overlay primitive.
 *
 * Implements the contract in
 * `.specs/adr/ADR-0009-component-primitives.md` — the decision to keep
 * primitives hand-rolled rather than adopt Radix, which is only defensible
 * because these seven behaviours are written down and tested:
 *
 * 1. `role="dialog"` and `aria-modal="true"` on the panel
 * 2. an accessible name, from the caller's `title`
 * 3. focus moves into the dialog on open
 * 4. Tab and Shift+Tab cycle within it and never reach the page
 * 5. `Escape` closes it
 * 6. focus returns to whatever opened it, on every close path
 * 7. the page behind does not scroll while it is open
 *
 * Before this existed, the two overlays in the app declared no role, no
 * `aria-modal`, and trapped no focus between them: tabbing inside either one
 * walked out into the page behind it, invisibly to everyone who did not need it
 * (ADR-0005 recorded both).
 *
 * **Do not hand-roll a second overlay.** That is how there came to be two.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive technology. Rendered unless `hideTitle`. */
  title: string;
  /** For dialogs whose own content is the heading, e.g. the search palette. */
  hideTitle?: boolean;
  children: ReactNode;
  /** Extra classes for the panel. The overlay and centring are not overridable. */
  className?: string;
  /** Header content rendered beside the title — actions, a close button. */
  headerRight?: ReactNode;
  'data-testid'?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
  className = '',
  headerRight,
  'data-testid': testId,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  // The trap, the escape handler and the focus restoration all live in
  // useFocusTrap, which the mobile sidebar shares — ADR-0009's warning is that
  // hand-rolled overlays drift apart, and two of them already had.
  useFocusTrap(panelRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* Presentational: the accessible way out is Escape and the close button,
          both of which exist. A backdrop that is also a button would be
          announced as one more thing to tab past. */}
      <div
        data-testid="dialog-backdrop"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        data-focus-trap="on"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        // The panel takes focus itself when it holds nothing focusable, so it
        // needs a visible ring like anything else that can hold focus —
        // `outline-none` alone would make that state invisible.
        className={`relative bg-card text-card-foreground border rounded-xl shadow-2xl flex flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
      >
        <div className={hideTitle ? 'sr-only' : 'p-4 border-b flex justify-between items-center shrink-0'}>
          <h2 id={titleId} className={hideTitle ? '' : 'font-semibold'}>
            {title}
          </h2>
          {!hideTitle && headerRight}
        </div>
        {hideTitle && headerRight}
        {children}
      </div>
    </div>,
    document.body,
  );
}
