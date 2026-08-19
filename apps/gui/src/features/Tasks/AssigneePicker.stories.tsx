import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssigneePicker } from './AssigneePicker';

// The assignee list itself is a prop, not a query - only the candidate
// search (opened via "Assign…") is RPC-backed, and it's gated behind
// isPicking (starts false), so both stories below are genuinely populated,
// zero-mocking states, unlike the manager screens that fetch on mount.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/Tasks/AssigneePicker',
  component: AssigneePicker,
  parameters: {
    layout: 'padded',
  },
  args: {
    taskId: 'task-storybook',
    orgId: 'org-storybook',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-xs">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AssigneePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unassigned: Story = {
  args: {
    assignees: [],
  },
};

export const Populated: Story = {
  args: {
    assignees: [
      { userId: 'user-1', agentId: '', name: 'Dev User' },
      { userId: '', agentId: 'agent-1', name: 'CI worker' },
    ],
  },
};
