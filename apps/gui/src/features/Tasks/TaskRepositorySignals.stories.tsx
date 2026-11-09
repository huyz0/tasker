import type { Meta, StoryObj } from '@storybook/react-vite';
import { create } from '@bufbuild/protobuf';
import { RemotePullRequestSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskRepositorySignals } from './TaskRepositorySignals';

const meta = {
  title: 'Features/Tasks/Recorded pull requests', component: TaskRepositorySignals,
  args: { taskId: 'task-story', records: [], state: 'ready', onRetry: () => {} },
  decorators: [(Story) => <div className="max-w-2xl"><Story /></div>],
} satisfies Meta<typeof TaskRepositorySignals>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Loading: Story = { args: { state: 'loading' } };
export const Error: Story = { args: { state: 'error' } };
export const Denied: Story = { args: { state: 'denied' } };
export const Populated: Story = { args: { records: [create(RemotePullRequestSchema, { id: 'pr-story', taskId: 'task-story', title: 'Make task evidence available for review', status: 'merged', url: 'https://github.com/example/project/pull/42', updatedAt: '2026-11-09T12:00:00Z' })] } };
