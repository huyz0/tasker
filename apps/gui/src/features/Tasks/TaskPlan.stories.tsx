import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskPlan } from './TaskPlan';

const meta = {
  title: 'Features/Tasks/TaskPlan',
  component: TaskPlan,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof TaskPlan>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgress: Story = {
  args: {
    steps: [
      { title: 'Reproduce the failure locally', status: 'done' },
      { title: 'Find the migration that dropped the index', status: 'done' },
      { title: 'Write the fix and a regression test', status: 'in_progress' },
      { title: 'Benchmark on the large fixture', status: 'skipped' },
      { title: 'Open the pull request', status: 'pending' },
    ] as any,
  },
};

export const NoPlan: Story = { args: { steps: [] } };
