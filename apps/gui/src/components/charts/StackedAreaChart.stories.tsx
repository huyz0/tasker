import type { Meta, StoryObj } from '@storybook/react-vite';
import { StackedAreaChart } from './StackedAreaChart';

const meta = {
  title: 'Charts/StackedAreaChart',
  component: StackedAreaChart,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof StackedAreaChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const days = (values: number[]) =>
  values.map((value, i) => ({
    date: `2026-08-${String(1 + i).padStart(2, '0')}`,
    value,
  }));

// The M24 cumulative-flow shape: backlog draining into doing and done over two
// weeks, first band at the bottom of the stack.
export const Populated: Story = {
  args: {
    title: 'Cumulative flow',
    description: 'Tasks per status per day, stacked oldest status at the bottom.',
    bands: [
      { label: 'Done', colorToken: 6, points: days([0, 1, 2, 4, 5, 7, 8, 10, 11, 13, 15, 16, 18, 20]) },
      { label: 'In review', colorToken: 3, points: days([0, 1, 1, 2, 3, 2, 3, 2, 4, 3, 2, 3, 2, 2]) },
      { label: 'Doing', colorToken: 2, points: days([2, 3, 4, 3, 4, 5, 4, 5, 4, 5, 4, 3, 4, 3]) },
      { label: 'Backlog', colorToken: 1, points: days([18, 17, 15, 14, 12, 10, 9, 8, 7, 5, 5, 4, 3, 2]) },
    ],
  },
};

// A task type with more statuses than the palette has tokens: the seventh and
// eighth bands cycle back to tokens 1 and 2 (ADR-0021) — the labels and the
// sr-only table keep them distinguishable.
export const ManyBands: Story = {
  args: {
    title: 'Cumulative flow by status',
    description: 'Tasks per status per day for a task type with eight statuses.',
    bands: [
      'Done',
      'Approved',
      'In review',
      'Testing',
      'Doing',
      'Planned',
      'Triaged',
      'Backlog',
    ].map((label, i) => ({
      label,
      colorToken: i + 1,
      points: days([3 + i, 4 + i, 3 + i, 5 + i, 4 + i, 6 + i, 5 + i]),
    })),
  },
};

export const Empty: Story = {
  args: {
    title: 'Cumulative flow',
    description: 'Tasks per status per day, stacked oldest status at the bottom.',
    bands: [],
  },
};
