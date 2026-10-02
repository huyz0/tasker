import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TaskRelations } from './TaskRelations';

// Relations are fetched on mount (listTaskLinks) through a real client - the
// same documented gap as TaskArtifactLinks' stories: no MSW is wired into
// Storybook, so this is the real loading-then-error path against a backend
// Storybook cannot reach. The populated, empty and picker states are covered
// by TaskRelations.test.tsx against MSW.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/Tasks/TaskRelations',
  component: TaskRelations,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <div className="max-w-xs">
            <Story />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof TaskRelations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InTaskDetail: Story = {
  args: { taskId: 'task-storybook', projectId: 'proj-storybook' },
};
