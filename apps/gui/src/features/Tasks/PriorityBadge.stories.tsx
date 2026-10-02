import type { Meta, StoryObj } from '@storybook/react-vite';
import { PriorityBadge, BlockedBadge } from './PriorityBadge';

const meta = {
  title: 'Features/Tasks/PriorityBadge',
  component: PriorityBadge,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PriorityBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Urgent: Story = { args: { priority: 1 } };
export const High: Story = { args: { priority: 2 } };
export const Medium: Story = { args: { priority: 3 } };
export const Low: Story = { args: { priority: 4 } };

// "No priority" renders nothing - the common case says nothing on a card.
export const NoPriority: Story = { args: { priority: 0 } };

// Every state side by side, as a card shows them next to its display id.
export const AllWithBlocked: Story = {
  args: { priority: 1 },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      {[1, 2, 3, 4].map((p) => <PriorityBadge key={p} priority={p} />)}
      <BlockedBadge count={1} />
      <BlockedBadge count={3} />
    </div>
  ),
};
