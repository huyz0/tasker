import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { PlanStepSchema, TaskSummarySchema, UsageTotalsSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskContext } from './TaskContext';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const meta = {
  title: 'Features/Tasks/Optional context', component: TaskContext,
  args: { taskId: 'task-story' },
  decorators: [(Story) => <QueryClientProvider client={client}><div className="max-w-2xl p-panel"><Story /></div></QueryClientProvider>],
} satisfies Meta<typeof TaskContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Populated: Story = { args: {
  summary: create(TaskSummarySchema, { text: 'Verified the release and recorded the outcome.', authorName: 'Release agent', updatedAt: '2026-11-08T09:00:00Z' }),
  plan: [create(PlanStepSchema, { title: 'Verify the build', status: 'done' }), create(PlanStepSchema, { title: 'Publish the release notes', status: 'in_progress' })],
  usage: create(UsageTotalsSchema, { reports: 2n, inputTokens: 12000n, outputTokens: 2000n, costMicros: 30000n }),
} };
