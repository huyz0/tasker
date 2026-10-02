import type { Meta, StoryObj } from '@storybook/react-vite';
import { create } from '@bufbuild/protobuf';
import { UsageTotalsSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskUsage } from './TaskUsage';

const meta = {
  title: 'Features/Tasks/TaskUsage',
  component: TaskUsage,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-xl"><Story /></div>],
} satisfies Meta<typeof TaskUsage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reported: Story = {
  args: { usage: create(UsageTotalsSchema, { inputTokens: 184_220n, outputTokens: 12_904n, costMicros: 2_731_500n, reports: 7n }) },
};

export const NothingReported: Story = { args: {} };
