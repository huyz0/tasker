import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskArtifactLinks } from './TaskArtifactLinks';

// Links are fetched on mount (listTaskArtifactLinks) via a real
// createClient(...) call - the same documented gap as Memory/Handoffs' own
// stories: no MSW is wired in, so this is the real loading state against an
// unreachable-in-Storybook backend.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/Tasks/TaskArtifactLinks',
  component: TaskArtifactLinks,
  parameters: {
    layout: 'padded',
  },
  args: {
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
} satisfies Meta<typeof TaskArtifactLinks>;

export default meta;
type Story = StoryObj<typeof meta>;

// From a task's own detail view, looking outward at its linked artifacts.
export const FromTask: Story = {
  args: {
    taskId: 'task-storybook',
  },
};

// From the artifact viewer, looking outward at the tasks it's linked to -
// the same component, the opposite end of the relation (see
// TaskArtifactLinks.tsx's own doc comment).
export const FromArtifact: Story = {
  args: {
    artifactId: 'artifact-storybook',
  },
};
