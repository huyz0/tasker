import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaskTypesEditor } from './index';
import { useLayoutStore } from '../../store/layout';

// This local client is an explicit override of the global preview provider.
// Its real resource reads settle into an unavailable state without a backend.
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
