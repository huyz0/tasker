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
}

export function RowActionsMenu({ label, actions }: { label: string; actions: RowAction[] }) {
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
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onClick}
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
