import type { Meta, StoryObj } from '@storybook/react-vite';
import { LineChart } from './LineChart';

const meta = {
  title: 'Charts/LineChart',
  component: LineChart,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const days = (values: number[], start = 1) =>
  values.map((value, i) => ({
    date: `2026-08-${String(start + i).padStart(2, '0')}`,
    value,
  }));

// The M24 "created vs completed" shape: two counts drifting apart, a third
// series showing rework spikes — realistic ranges, not sine waves.
export const Populated: Story = {
  args: {
    title: 'Created vs completed',
    description: 'Tasks created and completed per day over the last two weeks.',
    series: [
      { label: 'Created', colorToken: 1, points: days([4, 6, 3, 8, 5, 2, 0, 7, 9, 4, 6, 5, 3, 6]) },
      { label: 'Completed', colorToken: 2, points: days([2, 3, 5, 4, 6, 3, 1, 4, 6, 7, 5, 6, 4, 5]) },
      { label: 'Reworked', colorToken: 3, points: days([0, 1, 0, 2, 0, 0, 0, 1, 3, 0, 1, 0, 0, 1]) },
    ],
  },
};

// A project whose history started yesterday: one point per series, the
// footnote saying honestly why the chart is so bare.
export const SinglePoint: Story = {
  args: {
    title: 'Autonomy and rework',
    description: 'Share of tasks completed autonomously per day.',
    yFormat: (v: number) => `${v}%`,
    footnote: 'History collected since 2026-08-21.',
    series: [
      { label: 'Autonomous', colorToken: 1, points: days([72], 22) },
      { label: 'Assisted', colorToken: 4, points: days([28], 22) },
    ],
  },
};

export const Empty: Story = {
  args: {
    title: 'Created vs completed',
    description: 'Tasks created and completed per day over the last two weeks.',
    series: [],
  },
};
