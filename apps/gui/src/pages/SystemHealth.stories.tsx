import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemHealthPage } from './SystemHealth';

// Owns real createClient(...) calls (HealthService.ping, plus
// AccountSettings' own AuthService call). No global QueryClientProvider
// decorator exists in .storybook/preview.tsx and no MSW is wired in - the
// same documented gap as Memory/Handoffs' own stories: this is the real
// loading state against an unreachable-in-Storybook backend.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const meta = {
  title: 'Pages/SystemHealth',
  component: SystemHealthPage,
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
} satisfies Meta<typeof SystemHealthPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
