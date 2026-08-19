import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewerPicker } from './ReviewerPicker';

// Reviewers, unlike AssigneePicker's assignee list, are fetched on mount
// (listTaskReviewers) via a real createClient(...) call - the same
// documented gap as Memory/Handoffs' own stories: no MSW is wired in, so
// this is the real loading state against an unreachable-in-Storybook
// backend.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/Tasks/ReviewerPicker',
  component: ReviewerPicker,
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
} satisfies Meta<typeof ReviewerPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
