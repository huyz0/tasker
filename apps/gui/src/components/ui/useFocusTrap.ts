import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps Tab inside `containerRef` while `active`, and puts focus back where it
 * came from on the way out.
 *
 * Extracted from `Dialog` so the mobile sidebar could have the same behaviour
 * without a second implementation — ADR-0009's warning is precisely that
 * hand-rolled overlays drift apart, and the app already had two that disagreed.
 *
 * @see .specs/adr/ADR-0009-component-primitives.md
 */

/**
 * `[tabindex="-1"]` is deliberately excluded: it is programmatically focusable
 * but not part of the tab ring, so including it would stop the cycle somewhere
 * the user cannot Tab back out of.
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
 * The last element focused outside any trapped container.
 *
 * A child with `autoFocus` takes focus during the commit, before the effect
 * below runs, so `document.activeElement` can already be inside the container
 * and the element that opened it is unrecoverable. Restoring to the inside
 * element focuses a detached node once it unmounts, which the browser turns
 * into `body` — the keyboard user lands at the top of the document. The search
 * palette did exactly this (M06-T03).
 */
let lastFocusOutside: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-focus-trap="on"]')) lastFocusOutside = target;
    },
    true,
  );
}

/**
 * The element `lastFocusOutside` tracks, for anything that needs the same
 * "what opened this" answer without running the rest of this hook — `Dialog`
 * marks its Radix-backed panel with the same `data-focus-trap="on"` this file
 * already excludes, and reuses this single shared tracker rather than a second
 * capture-phase listener.
 */
export function getLastFocusOutside(): HTMLElement | null {
  return lastFocusOutside;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  // Held in a ref, not a dependency. Callers write `() => setOpen(false)`
  // inline, so the function identity changes on every render — as a dependency
  // it tore the effect down and set it up again each time, and the teardown
  // restores focus to whatever opened the container. The drawer opened with
  // focus snapping straight back to the hamburger (M06-T10).
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const focusable = useCallback(() => {
    const container = containerRef.current;
    if (!container) return [] as HTMLElement[];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
      // Not `offsetParent !== null`: that is null for the entire subtree of a
      // fixed-position element, which these containers are, so it would drop
      // every control and silently disable the trap.
      //
      // `checkVisibility` catches what that missed — an element inside a
      // `display: none` ancestor. The sidebar holds a `hidden md:block` search
      // trigger, so on a phone the first "focusable" was unrenderable and
      // `.focus()` on it did nothing at all: the drawer opened with focus still
      // on the hamburger (M06-T10). jsdom has no layout and no
      // `checkVisibility`, hence the `?? true`.
      return el.checkVisibility?.({ checkVisibilityCSS: true }) ?? true;
    });
  }, [containerRef]);

  useEffect(() => {
    if (!active) return;

    const alreadyInside = document.activeElement && containerRef.current?.contains(document.activeElement);
    const opener = alreadyInside ? lastFocusOutside : (document.activeElement as HTMLElement | null);

    // Deferred by a frame. A *mouse* click focuses the element it hits after
    // the handler that opened this runs, so focusing synchronously here loses
    // the race and focus stays on the trigger — the drawer opened with the
    // hamburger still focused, and the first few Tabs then walked the header
    // instead of the drawer. Keyboard activation did not show this, which is
    // why the browser check caught it and the tests did not (M06-T10).
    const focusFirst = () => {
      if (containerRef.current?.contains(document.activeElement)) return;
      const first = focusable()[0];
      (first ?? containerRef.current)?.focus();
    };
    focusFirst();
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        containerRef.current?.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const activeEl = document.activeElement;

      // Wrapping is the whole trap. Without these two branches the browser
      // walks focus straight out and into the page behind.
      if (e.shiftKey && (activeEl === firstItem || activeEl === containerRef.current)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && activeEl === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      // Every close path lands here, so restoration cannot be forgotten at one
      // of them.
      opener?.focus?.();
    };
  }, [active, containerRef, focusable]);
}
