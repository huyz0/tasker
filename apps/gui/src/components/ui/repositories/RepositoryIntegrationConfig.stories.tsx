import type { Meta, StoryObj } from '@storybook/react';
import { RepositoryIntegrationConfig } from './RepositoryIntegrationConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Query Client for Storybook
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const meta = {
  title: 'UI/Repositories/RepositoryIntegrationConfig',
  component: RepositoryIntegrationConfig,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-2xl w-full">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof RepositoryIntegrationConfig>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    projectId: 'demo-project-id',
  },
};
