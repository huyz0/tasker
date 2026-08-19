import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Label } from './index';

// Label.Provider owns a real createClient(...) call (LabelService), the same
// as Comment.Provider - no global QueryClientProvider decorator exists in
// .storybook/preview.tsx, and there's no MSW wired in either, so this is the
// screen's real loading state against an unreachable-in-Storybook backend,
// not a mocked populated one. Mirrors Comment.stories.tsx's own pattern for
// the sibling compound component.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'UI/Label',
  component: Label.Provider,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof Label.Provider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTask: Story = {
  args: {
    entityId: 'task-1',
    entityType: 'task',
    orgId: 'org-storybook',
    children: (
      <div className="flex flex-col gap-3">
        <Label.Chips />
        <Label.Picker />
      </div>
    ),
  },
};
