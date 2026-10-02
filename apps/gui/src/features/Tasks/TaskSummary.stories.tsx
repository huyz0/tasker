import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { create } from '@bufbuild/protobuf';
import { TaskSummarySchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { TaskSummaryPanel } from './TaskSummary';

// Display states only; saving goes through a real client (no MSW in
// Storybook) and is covered by TaskSummary.test.tsx.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/Tasks/TaskSummary',
  component: TaskSummaryPanel,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <QueryClientProvider client={queryClient}><div className="max-w-xl"><Story /></div></QueryClientProvider>],
} satisfies Meta<typeof TaskSummaryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Written: Story = {
  args: {
    taskId: 'task-storybook',
    summary: create(TaskSummarySchema, {
      text: 'Shipped the export behind the `exports_v2` flag.\n\n- Decided: CSV first, Parquet later.\n- Gotcha: the date index must exist before backfill.',
      authorName: 'Closer',
      updatedAt: '2026-10-02T10:00:00Z',
    }),
  },
};

export const NoneYet: Story = { args: { taskId: 'task-storybook' } };
