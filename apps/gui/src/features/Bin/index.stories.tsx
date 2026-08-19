import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BinDashboard } from './index';
import { useLayoutStore } from '../../store/layout';

// Owns several real createClient(...) calls (per-tab, e.g. ProjectService,
// AgentService, each with onlyDeleted:true). No global QueryClientProvider
// decorator exists in .storybook/preview.tsx and no MSW is wired in - the
// same documented gap as Memory/Handoffs' own stories: this is the real
// loading state against an unreachable-in-Storybook backend for whichever
// tab is active (Organizations, by default).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/BinDashboard',
  component: BinDashboard,
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
} satisfies Meta<typeof BinDashboard>;

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
