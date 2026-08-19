import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Renders only the rows currently on screen.
 *
 * M07's fifth exit criterion is that every list view goes through a
 * virtualizer. The task board and the org member list each grew their own
 * copy of this wiring; a third and fourth copy is how the overscan, the
 * absolute positioning and the total-height calculation drift apart between
 * views that should behave identically.
 *
 * There is deliberately no "load the next page when you reach the bottom" hook.
 * With a short list every render is already at the bottom, so it fetches the
 * next page the moment the list mounts — which is paging that pages
 * immediately. Callers that want more rows offer an explicit control.
 *
 * Rows are a fixed height on purpose. Measuring each row lets a virtualizer
 * handle variable content, and it also makes the scrollbar jump as rows are
 * measured — for a list of uniform rows the fixed size is both faster and
 * steadier.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  className,
  overscan = 8,
  emptyState,
  measureRows = false,
}: {
  items: readonly T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
  emptyState?: ReactNode;
  /**
   * Measure each row instead of trusting `rowHeight`.
   *
   * For rows that change height — a card that grows an inline edit form, say —
   * a fixed height misplaces every row below the one that changed. Costs a
   * layout read per row, so it is off unless a view needs it, and `rowHeight`
   * remains the estimate used before a row has been measured.
   */
  measureRows?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    measureElement: measureRows ? (el) => el.getBoundingClientRect().height : undefined,
  });

  const virtualRows = virtualizer.getVirtualItems();

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    // A scrollable region has to be reachable by keyboard on its own -
    // without tabIndex a mouse is the only way to scroll it, which is
    // exactly what axe's scrollable-region-focusable rule catches (found
    // via VirtualList's own Storybook story, the first place this
    // primitive was ever checked for it: every real caller's own view
    // happens to have some other focusable element inside the visible
    // rows, which is enough to satisfy a keyboard user reaching row
    // content, but not the region itself when a caller wants to scroll
    // without tabbing through every row first).
    <div ref={scrollRef} tabIndex={0} className={className}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualRows.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={measureRows ? virtualizer.measureElement : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              // A measured row sizes itself; forcing a height would defeat the
              // measurement it was just asked to perform.
              ...(measureRows ? {} : { height: row.size }),
              transform: `translateY(${row.start}px)`,
            }}
          >
            {renderRow(items[row.index]!, row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
