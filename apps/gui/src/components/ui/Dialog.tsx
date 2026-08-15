import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
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

/**
 * Elements that can hold focus. `[tabindex="-1"]` is deliberately excluded: it
 * is programmatically focusable but not part of the tab ring, so including it
 * would make the cycle stop somewhere the user cannot Tab back out of.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The last element focused outside any dialog.
 *
 * Needed because a child with `autoFocus` takes focus during the commit, before
 * the dialog's own effect runs — so by then `document.activeElement` is already
 * *inside* the dialog and the element that opened it is unrecoverable. Restoring
 * to the inside element focuses a detached node once the dialog unmounts, which
 * the browser turns into `body`: the keyboard user lands at the top of the
 * document. The search palette did exactly this (M06-T03).
 */
let lastFocusOutsideDialog: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[role="dialog"]')) lastFocusOutsideDialog = target;
    },
    true,
  );
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
  // Captured on open, restored on close. Reading it at close time is too late:
  // by then focus is inside the dialog.
  const openerRef = useRef<HTMLElement | null>(null);

  const focusable = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return [] as HTMLElement[];
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      // Not `offsetParent !== null`: that is null for the whole subtree of a
      // fixed-position element, which this panel is, so it would drop every
      // control and silently disable the trap.
      (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    const active = document.activeElement as HTMLElement | null;
    const activeIsOutside = active && !panelRef.current?.contains(active);
    openerRef.current = activeIsOutside ? active : lastFocusOutsideDialog;

    // Focus the first control, or the panel itself when there is none — an
    // unfocused dialog leaves the screen reader reading the page behind it.
    const first = focusable()[0];
    (first ?? panelRef.current)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        // Nothing to move to: keep focus on the panel rather than letting the
        // browser hand it to the page behind.
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      // Wrapping is the whole trap. Without these two branches the browser
      // walks focus straight out of the panel and into the page.
      if (e.shiftKey && (active === firstItem || active === panelRef.current)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Every close path lands here — Escape, the backdrop, a close button, or
      // the caller unmounting the dialog — so restoration cannot be forgotten
      // at one of them.
      openerRef.current?.focus?.();
    };
  }, [open, onClose, focusable]);

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
