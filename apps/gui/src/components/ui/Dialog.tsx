import { useEffect, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { getLastFocusOutside } from './useFocusTrap';

/**
 * The one overlay primitive.
 *
 * Implements the contract in
 * `.specs/adr/ADR-0009-component-primitives.md`, now backed by
 * `@radix-ui/react-dialog` per
 * [ADR-0011](../../../../../.specs/adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md) —
 * the same seven behaviours, tested the same way, implemented by a library
 * instead of a hand-rolled focus trap:
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
 * **Do not hand-roll a second overlay.** That is how there came to be two —
 * and it is exactly what ADR-0011 adopted Radix to stop happening a third time.
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
  // Radix's own scroll lock goes through `react-remove-scroll`, which is a
  // no-op in jsdom (there is no real scrollbar to compensate for). This effect
  // is what actually satisfies behaviour 7 in tests, and is harmless — both it
  // and Radix's lock want `hidden` while open and the prior value on close.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <RadixDialog.Root
      open={open}
      // Only ever fires with `false`: Root calls this with `true` from its
      // own Trigger's click handler, and this component renders no Trigger —
      // every caller's trigger is an ordinary button outside Radix's control.
      // A branch on a value that never arrives is untestable, not defensive.
      onOpenChange={() => onClose()}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          data-testid="dialog-backdrop"
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-overlay bg-background/80 backdrop-blur-sm"
        />
        {/* A presentational, click-through centring box — Content is the only
            thing inside it that can receive pointer events, so a click in the
            padding around the panel still reaches the Overlay behind it and
            closes the dialog. */}
        <div className="fixed inset-0 z-overlay flex items-center justify-center p-4 md:p-8 pointer-events-none">
          <RadixDialog.Content
            data-testid={testId}
            data-focus-trap="on"
            // This Radix version renders `role="dialog"` but leaves
            // `aria-modal` to the consumer — contract item 1 needs it stated,
            // not implied.
            aria-modal="true"
            // Radix's own default here focuses `Dialog.Trigger`'s ref, which
            // is `null` unless a caller renders that component — none of ours
            // do, since a trigger can be a sidebar button, a card, anything.
            // `getLastFocusOutside` is the same capture-phase tracker
            // `useFocusTrap` uses for the mobile drawer: whatever last held
            // focus outside any `data-focus-trap="on"` container, updated as
            // it happens rather than read from a ref that was never set.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              getLastFocusOutside()?.focus();
            }}
            className={`pointer-events-auto relative bg-card text-card-foreground border rounded-xl shadow-2xl flex flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
          >
            <RadixDialog.Title asChild>
              <div className={hideTitle ? 'sr-only' : 'p-4 border-b flex justify-between items-center shrink-0'}>
                <h2 className={hideTitle ? '' : 'font-semibold'}>{title}</h2>
                {!hideTitle && headerRight}
              </div>
            </RadixDialog.Title>
            {hideTitle && headerRight}
            {children}
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
