import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentSpendCard } from './AgentSpendCard';

// Fetched on mount through a real client - the documented no-MSW-in-Storybook
// gap (see Reports.stories.tsx), so this is the real loading-then-error path.
// Totals, bars, the agent table and the empty state are covered by
// AgentSpendCard.test.tsx against MSW.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/Reports/AgentSpendCard',
  component: AgentSpendCard,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <QueryClientProvider client={queryClient}><Story /></QueryClientProvider>],
} satisfies Meta<typeof AgentSpendCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { projectId: 'project-storybook', windowDays: 30 } };
