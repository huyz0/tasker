import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentTokens } from './AgentTokens';

// Owns a real createClient(...) call (AgentService). No global
// QueryClientProvider decorator exists in .storybook/preview.tsx and no MSW
// is wired in, so - the same documented gap as Memory/Handoffs' own
// stories - this shows the real "still loading" state against an
// unreachable-in-Storybook backend, not a mocked populated one.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Features/Agents/AgentTokens',
  component: AgentTokens,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-lg">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AgentTokens>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    agentId: 'agent-storybook',
    agentName: 'CI worker',
  },
};
