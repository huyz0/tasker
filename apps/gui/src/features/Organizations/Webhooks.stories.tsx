import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Webhooks } from './Webhooks';

// Webhooks are fetched on mount through a real client - the same documented
// gap as AuditTrail's story: no MSW in Storybook, so this is the real
// loading-then-error path against a backend Storybook cannot reach. The
// populated, empty, forbidden and form states are covered by Webhooks.test.tsx.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Features/Organizations/Webhooks',
  component: Webhooks,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-3xl">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof Webhooks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ForAnOrganization: Story = { args: { orgId: 'org-storybook' } };
