import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentTokens } from './AgentTokens';
import { useState, type PropsWithChildren } from 'react';

// Authorized empty state. A failed admin lookup deliberately hides this panel,
// so an unreachable backend would be an empty preview instead of useful UI.
function AuthorizedTokenPreview({ children }: PropsWithChildren) {
  const [client] = useState(() => {
    const fixture = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    fixture.setQueryData(['agentTokens', 'agent-storybook'], []);
    return fixture;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta = {
  title: 'Features/Agents/AgentTokens',
  component: AgentTokens,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <AuthorizedTokenPreview>
        <div className="max-w-lg">
          <Story />
        </div>
      </AuthorizedTokenPreview>
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
