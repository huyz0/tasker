import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { RepositoryIntegrationConfig } from './RepositoryIntegrationConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListRepositoryLinks, mockListPullRequests, mockSyncPullRequests, mockListBuilds, mockListDeployments } = vi.hoisted(() => ({
  mockListRepositoryLinks: vi.fn(),
  mockListPullRequests: vi.fn(),
  mockSyncPullRequests: vi.fn(),
  mockListBuilds: vi.fn(),
  mockListDeployments: vi.fn(),
}));

// Mock the ConnectRPC client
vi.mock('@connectrpc/connect', () => ({
  createClient: () => ({
    listRepositoryLinks: mockListRepositoryLinks,
    listPullRequests: mockListPullRequests,
    syncPullRequests: mockSyncPullRequests,
    listBuilds: mockListBuilds,
    listDeployments: mockListDeployments,
  }),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn()
}));

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositoryIntegrationConfig projectId="proj-123" />
    </QueryClientProvider>
  );
}

describe('RepositoryIntegrationConfig', () => {
  beforeEach(() => {
    mockListRepositoryLinks.mockReset();
    mockListPullRequests.mockReset();
    mockSyncPullRequests.mockReset();
    mockListBuilds.mockReset();
    mockListDeployments.mockReset();
  });

  test('renders loading and then data', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });

    renderComponent();

    expect(await screen.findByText(/huyz0\/tasker/)).toBeDefined();
    expect(screen.getByText('Add New Link (OAuth flow simulation)')).toBeDefined();
  });

  test('lists synced pull requests for a linked repository', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({
      pullRequests: [{ id: 'pr-1', remotePrId: '42', title: 'Fix the thing', status: 'open' }],
    });

    renderComponent();

    await waitFor(() => expect(screen.getByText('#42: Fix the thing')).toBeDefined());
    expect(screen.getByText('open')).toBeDefined();
  });

  test('shows an empty state when no pull requests have been synced', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });

    renderComponent();

    await waitFor(() => expect(screen.getByText('No pull requests synced yet.')).toBeDefined());
  });

  test('syncs pull requests and refreshes the list', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests
      .mockResolvedValueOnce({ pullRequests: [] })
      .mockResolvedValueOnce({ pullRequests: [{ id: 'pr-1', remotePrId: '42', title: 'Fix the thing', status: 'open' }] });
    mockSyncPullRequests.mockResolvedValue({ success: true });

    renderComponent();

    await waitFor(() => expect(screen.getByText('No pull requests synced yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Sync PRs'));

    await waitFor(() => expect(mockSyncPullRequests).toHaveBeenCalledWith({ projectId: 'proj-123' }));
    await waitFor(() => expect(screen.getByText('#42: Fix the thing')).toBeDefined());
  });

  test('shows an error message when sync fails', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });
    mockSyncPullRequests.mockRejectedValue(new Error('provider unavailable'));

    renderComponent();

    await waitFor(() => expect(screen.getByText('No pull requests synced yet.')).toBeDefined());
    fireEvent.click(screen.getByText('Sync PRs'));

    await waitFor(() => expect(screen.getByText('Failed to sync pull requests: provider unavailable')).toBeDefined());
  });

  test('shows builds and their deployments when expanded', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: 'link-1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });
    mockListBuilds.mockResolvedValue({
      builds: [{ id: 'build-1', repositoryLinkId: 'link-1', status: 'SUCCESS', commitSha: 'abc1234def' }],
    });
    mockListDeployments.mockResolvedValue({
      deployments: [{ id: 'dep-1', buildId: 'build-1', environment: 'STAGING', status: 'SUCCESS' }],
    });

    renderComponent();

    await waitFor(() => expect(screen.getByText('huyz0/tasker', { exact: false })).toBeDefined());
    fireEvent.click(screen.getByText('Show Builds'));

    await waitFor(() => expect(mockListBuilds).toHaveBeenCalledWith({ repositoryLinkId: 'link-1' }));
    await waitFor(() => expect(screen.getByText('abc1234')).toBeDefined());

    fireEvent.click(screen.getByText('abc1234'));

    await waitFor(() => expect(mockListDeployments).toHaveBeenCalledWith({ buildId: 'build-1' }));
    await waitFor(() => expect(screen.getByText('STAGING')).toBeDefined());
  });

  test('shows an empty state when a repository link has no builds', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: 'link-1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });
    mockListBuilds.mockResolvedValue({ builds: [] });

    renderComponent();

    await waitFor(() => expect(screen.getByText('huyz0/tasker', { exact: false })).toBeDefined());
    fireEvent.click(screen.getByText('Show Builds'));

    await waitFor(() => expect(screen.getByText('No builds found.')).toBeDefined());
  });
});
