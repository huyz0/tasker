import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationBell } from './NotificationBell';

/**
 * The bell owns a real `createClient(...)` with no MSW wired into Storybook —
 * the same documented gap `AuditTrail.stories.tsx` and Memory/Handoffs carry.
 * What these stories are worth eyeballing is the closed affordance, its badge
 * geometry against the header, and the open panel's empty and loading states,
 * all of which render without a backend.
 *
 * The list-with-content state is covered by `NotificationBell.test.tsx`
 * against the real transport, which is where it can actually be asserted.
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta = {
  title: 'Layout/NotificationBell',
  component: NotificationBell,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="flex justify-end p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The resting state: no badge, because a quiet app should not wear a marker. */
export const Default: Story = {
  args: { orgId: 'org-storybook' },
};

/**
 * No org selected — both queries are disabled, so this is genuinely idle
 * rather than a load that never resolves.
 */
export const NoOrganization: Story = {
  args: { orgId: '' },
};
