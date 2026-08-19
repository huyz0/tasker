import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskTypesEditor } from './index';
import { useLayoutStore } from '../../store/layout';

// Owns real createClient(...) calls (TaskTypeService, ProjectTemplateService).
// No global QueryClientProvider decorator exists in .storybook/preview.tsx
// and no MSW is wired in - the same documented gap as Memory/Handoffs' own
// stories: this is the real loading state against an unreachable-in-
// Storybook backend.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/TaskTypesEditor',
  component: TaskTypesEditor,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof TaskTypesEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook' });
      return <Story />;
    },
  ],
};
