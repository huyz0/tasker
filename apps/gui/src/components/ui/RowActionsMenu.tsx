import { useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

/**
 * A row's overflow actions, collapsed behind one trigger.
 *
 * `design-system.md` §4: "Do not hand-roll a second overlay, menu, or tab
 * implementation." Organizations rendered Edit and Delete as always-visible
 * text buttons in a `shrink-0` group beside a `min-w-[200px]` name — the two
 * together overflowed `main`'s hidden horizontal scroll at 375px, so every
 * org's Edit and Delete were simply unreachable on a phone. A fixed-width
 * icon trigger cannot overflow the way a growing button group can; Radix
 * supplies the roving-tabindex and typeahead a hand-rolled menu would get
 * slightly wrong, per ADR-0011.
 */
export interface RowAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /**
   * This action opens something that takes and manages its own focus - an
   * inline edit input, typically - rather than leaving the trigger button
   * as the next sensible focus target.
   *
   * Radix keeps the dropdown's `FocusScope` *trapped* for one extra tick
   * after a close starts (so an exit animation has something to animate),
   * and while trapped it forcibly refocuses anything that tries to take
   * focus from outside the (closing) menu - including an `autoFocus` input
   * mounted by this same click, immediately blurring it again before the
   * user ever sees it focused. `onCloseAutoFocus` only fires once that trap
   * has genuinely released, so an action flagged here has its `onClick`
   * deferred to that point instead of run immediately in `onSelect` -
   * Radix's own documented pattern for handing focus to a custom element
   * after a menu closes. Roles' inline rename, opened via this menu rather
   * than by clicking the name directly, needed exactly this: opened via
   * `onSelect`, its `autoFocus` input blurred and reverted itself on the
   * same tick it opened.
   */
  managesFocusOnSelect?: boolean;
}

export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const pendingActionRef = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={label}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-overlay min-w-[140px] rounded-md border bg-popover text-popover-foreground p-1 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onCloseAutoFocus={(event) => {
            const run = pendingActionRef.current;
            if (run) {
              // Also stops Radix's own default (returning focus to the
              // trigger) - the deferred action is about to move focus
              // somewhere more specific than that.
              event.preventDefault();
              pendingActionRef.current = null;
              run();
            }
          }}
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={() => {
                if (action.managesFocusOnSelect) pendingActionRef.current = action.onClick;
                else action.onClick();
              }}
              // `data-[highlighted]` already tracks arrow-key navigation, but
              // it is Radix's state, not the browser's — an explicit
              // `focus-visible:ring` is the same belt-and-suspenders the rest
              // of this codebase uses everywhere else `outline-none` appears.
              className={`flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${
                action.destructive ? 'text-destructive data-[highlighted]:text-destructive-foreground data-[highlighted]:bg-destructive' : ''
              }`}
            >
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
