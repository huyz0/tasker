import type { Meta, StoryObj } from '@storybook/react-vite';
import { VirtualList } from './VirtualList';

const ITEMS = Array.from({ length: 200 }, (_, i) => ({ id: `item-${i}`, label: `Row ${i + 1}` }));

// VirtualList<T> is generic, so Storybook can't infer a component type from
// it directly - this fixed-string-items instance is what gets documented.
function VirtualListDemo({ items }: { items: typeof ITEMS }) {
  return (
    <VirtualList
      items={items}
      rowHeight={36}
      className="h-72 overflow-y-auto border rounded-md"
      emptyState={<p className="p-4 text-sm text-muted-foreground">No rows.</p>}
      renderRow={(item) => (
        <div className="h-9 flex items-center px-3 text-sm border-b last:border-b-0">{item.label}</div>
      )}
    />
  );
}

const meta = {
  title: 'UI/VirtualList',
  component: VirtualListDemo,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof VirtualListDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

// 200 rows in a 72px-tall viewport: only what's actually visible (plus
// overscan) is in the DOM, which is the entire point of this primitive
// (M07's exit criterion that every list view is virtualized).
export const Populated: Story = {
  args: {
    items: ITEMS,
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};
