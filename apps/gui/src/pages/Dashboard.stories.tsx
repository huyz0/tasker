import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import { useLayoutStore } from '../store/layout';

// Dashboard owns a real createClient(...) call (DashboardService). No global
// QueryClientProvider decorator exists in .storybook/preview.tsx and no MSW
// is wired in - the same documented gap as Memory/Handoffs' own stories.
// NoOrgSelected is genuinely zero-mocking (the component itself short-
// circuits before ever querying); WithOrgSelected is the real loading state
// against an unreachable-in-Storybook backend.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Pages/Dashboard',
  component: Dashboard,
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
} satisfies Meta<typeof Dashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoOrgSelected: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
      return <Story />;
    },
  ],
};

export const WithOrgSelected: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: 'org-storybook', activeProjectId: '' });
      return <Story />;
    },
  ],
};
