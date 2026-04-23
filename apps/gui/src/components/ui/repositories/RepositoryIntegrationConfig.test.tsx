import { render, screen } from '@testing-library/react';
import { expect, test, describe, vi } from 'vitest';
import { RepositoryIntegrationConfig } from './RepositoryIntegrationConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

// Mock the ConnectRPC client
vi.mock('@connectrpc/connect', () => {
  return {
    createClient: () => ({
      listRepositoryLinks: vi.fn().mockResolvedValue({
        links: [
          { id: '1', provider: 'github', remoteName: 'huyz0/tasker' }
        ]
      }),
      syncPullRequests: vi.fn().mockResolvedValue({ success: true })
    })
  };
});

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn()
}));

describe('RepositoryIntegrationConfig', () => {
  test('renders loading and then data', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RepositoryIntegrationConfig projectId="proj-123" />
      </QueryClientProvider>
    );

    // After loading, it should display the github link
    expect(await screen.findByText(/huyz0\/tasker/)).toBeDefined();
    expect(screen.getByText('Add New Link (OAuth flow simulation)')).toBeDefined();
  });
});
