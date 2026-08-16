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
}: {
  items: readonly T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  className?: string;
  overscan?: number;
  emptyState?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  const virtualRows = virtualizer.getVirtualItems();

  if (items.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div ref={scrollRef} className={className}>
      <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
        {virtualRows.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: row.size,
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
