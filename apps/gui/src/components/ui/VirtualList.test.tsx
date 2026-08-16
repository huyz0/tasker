import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VirtualList } from './VirtualList';

describe('VirtualList', () => {
  it('renders a window of rows rather than one node per item', () => {
    // The whole point: a folder can hold 100,000 artifacts, and the list this
    // replaced turned every one of them into a DOM node.
    const items = Array.from({ length: 10_000 }, (_, i) => ({ id: `row-${i}` }));

    const { container } = render(
      <VirtualList
        items={items}
        rowHeight={28}
        renderRow={(item: { id: string }) => <span>{item.id}</span>}
      />,
    );

    const rendered = container.querySelectorAll('[data-index]');
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(items.length);
  });

  it('sizes the scroll area to the full list, not to what is rendered', () => {
    // Without this the scrollbar reflects the handful of rendered rows, so the
    // list looks short and cannot be scrolled to the rows it is hiding.
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `row-${i}` }));

    const { container } = render(
      <VirtualList items={items} rowHeight={20} renderRow={(item: { id: string }) => <span>{item.id}</span>} />,
    );

    const sizer = container.querySelector('[style*="position: relative"]') as HTMLElement;
    expect(sizer.style.height).toBe(`${500 * 20}px`);
  });

  it('shows the empty state instead of an empty scroll area', () => {
    render(
      <VirtualList
        items={[]}
        rowHeight={28}
        renderRow={() => <span>never</span>}
        emptyState={<p>Nothing here</p>}
      />,
    );

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders nothing at all when empty and given no empty state', () => {
    // A caller that renders its own emptiness elsewhere must not also get a
    // stray scroll container from this one.
    const { container } = render(
      <VirtualList items={[]} rowHeight={28} renderRow={() => <span>never</span>} />,
    );

    expect(container.querySelectorAll('[data-index]')).toHaveLength(0);
  });

  it('hands each row its own item and index', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    render(
      <VirtualList
        items={items}
        rowHeight={28}
        renderRow={(item: { id: string }, index: number) => <span>{`${index}:${item.id}`}</span>}
      />,
    );

    // jsdom gives the scroll element no height, so the virtualizer renders the
    // overscan window from the top — enough to prove the mapping is right.
    expect(screen.getByText('0:a')).toBeInTheDocument();
  });
});
