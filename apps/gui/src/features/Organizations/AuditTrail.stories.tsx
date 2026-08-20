import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditTrail } from './AuditTrail';

// Owns a real createClient(...) call with no MSW wired in — the same
// documented gap as Memory/Handoffs' own stories. What this shows is the
// loading state against a backend Storybook cannot reach, plus the filter
// controls, which are the part worth eyeballing.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/AuditTrail',
  component: AuditTrail,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AuditTrail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { orgId: 'org-storybook' },
};

// No org selected: the query is disabled, so this is the genuinely-empty
// state rather than a load that never resolves.
export const NoOrganization: Story = {
  args: { orgId: '' },
};
