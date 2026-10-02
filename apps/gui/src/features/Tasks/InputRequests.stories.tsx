import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TaskInputRequests, QuestionsQueue } from './InputRequests';

// Fetched on mount through a real client - the same documented gap as
// TaskRelations' stories: no MSW in Storybook, so this is the real
// loading-then-error path. Open, answered and empty states are covered by
// InputRequests.test.tsx against MSW.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/Tasks/InputRequests',
  component: TaskInputRequests,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <div className="max-w-xl"><Story /></div>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof TaskInputRequests>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnATask: Story = { args: { taskId: 'task-storybook' } };

export const OrganizationQueue: Story = {
  args: { taskId: 'task-storybook' },
  render: () => <QuestionsQueue orgId="org-storybook" />,
};
