import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgProjectSwitcher } from './OrgProjectSwitcher';
import { useLayoutStore } from '../../store/layout';

// OrgProjectSwitcher owns two real createClient(...) calls (OrgService,
// ProjectService). No global QueryClientProvider decorator exists in
// .storybook/preview.tsx and no MSW is wired in, so - the same documented
// gap as Memory/Handoffs' own stories - this is the real loading state
// against an unreachable-in-Storybook backend, not a mocked populated one.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Layout/OrgProjectSwitcher',
  component: OrgProjectSwitcher,
  parameters: {
    layout: 'padded',
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
} satisfies Meta<typeof OrgProjectSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => {
      useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
      return <Story />;
    },
  ],
};
