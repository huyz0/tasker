import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, test, describe, vi, beforeEach } from 'vitest';
import { RepositoryIntegrationConfig } from './RepositoryIntegrationConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockListRepositoryLinks, mockListPullRequests, mockSyncPullRequests, mockListBuilds, mockListDeployments, mockAddRepositoryLink } = vi.hoisted(() => ({
  mockListRepositoryLinks: vi.fn(),
  mockListPullRequests: vi.fn(),
  mockSyncPullRequests: vi.fn(),
  mockListBuilds: vi.fn(),
  mockListDeployments: vi.fn(),
  mockAddRepositoryLink: vi.fn(),
}));

// Mock the ConnectRPC client
vi.mock('@connectrpc/connect', () => ({
  createClient: () => ({
    listRepositoryLinks: mockListRepositoryLinks,
    listPullRequests: mockListPullRequests,
    syncPullRequests: mockSyncPullRequests,
    listBuilds: mockListBuilds,
    listDeployments: mockListDeployments,
    addRepositoryLink: mockAddRepositoryLink,
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
    mockAddRepositoryLink.mockReset();
  });

  test('renders loading and then data', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [{ id: '1', provider: 'github', remoteName: 'huyz0/tasker' }] });
    mockListPullRequests.mockResolvedValue({ pullRequests: [] });

    renderComponent();

    expect(await screen.findByText(/huyz0\/tasker/)).toBeDefined();
    expect(screen.getByText('Add New Link')).toBeDefined();
  });

  test('does not offer GitLab as a provider option, since it is not supported by the backend', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [] });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Add New Link')).toBeDefined());
    expect(screen.queryByText('GitLab')).toBeNull();
  });

  test('links a Bitbucket repository using a direct API token', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [] });
    mockAddRepositoryLink.mockResolvedValue({ link: { id: 'link-2', provider: 'bitbucket', remoteName: 'huyz0/bb-repo' } });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Add New Link')).toBeDefined());
    fireEvent.change(screen.getByDisplayValue('GitHub'), { target: { value: 'bitbucket' } });
    fireEvent.change(screen.getByPlaceholderText('Remote (e.g. huyz0/tasker)'), { target: { value: 'huyz0/bb-repo' } });
    fireEvent.change(screen.getByPlaceholderText('Atlassian account email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('API token'), { target: { value: 'ATATT-fake-token' } });
    fireEvent.click(screen.getByText('Link with API token'));

    await waitFor(() => expect(mockAddRepositoryLink).toHaveBeenCalledWith({
      projectId: 'proj-123',
      provider: 'bitbucket',
      remoteName: 'huyz0/bb-repo',
      email: 'user@example.com',
      apiToken: 'ATATT-fake-token',
    }));
  });

  test('stores a per-flow nonce in sessionStorage before starting the OAuth redirect, binding the callback to this tab (login CSRF protection)', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [] });
    sessionStorage.removeItem('repoLinkOauthNonce');

    const originalLocation = window.location;
    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', { writable: true, configurable: true, value: locationStub });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Add New Link')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Remote (e.g. huyz0/tasker)'), { target: { value: 'huyz0/tasker' } });
    fireEvent.click(screen.getByText('Connect GitHub via OAuth'));

    const nonce = sessionStorage.getItem('repoLinkOauthNonce');
    expect(nonce).toBeTruthy();
    expect(locationStub.href).toContain('state=');
    const stateParam = new URL(locationStub.href).searchParams.get('state')!;
    const state = JSON.parse(atob(stateParam));
    expect(state.nonce).toBe(nonce);

    Object.defineProperty(window, 'location', { writable: true, configurable: true, value: originalLocation });
  });

  test('links a GitHub repository using a direct personal access token, with no email required', async () => {
    mockListRepositoryLinks.mockResolvedValue({ links: [] });
    mockAddRepositoryLink.mockResolvedValue({ link: { id: 'link-3', provider: 'github', remoteName: 'huyz0/gh-repo' } });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Add New Link')).toBeDefined());
    fireEvent.change(screen.getByPlaceholderText('Remote (e.g. huyz0/tasker)'), { target: { value: 'huyz0/gh-repo' } });
    fireEvent.change(screen.getByPlaceholderText('Personal access token'), { target: { value: 'ghp_fake-pat' } });
    fireEvent.click(screen.getByText('Link with API token'));

    await waitFor(() => expect(mockAddRepositoryLink).toHaveBeenCalledWith({
      projectId: 'proj-123',
      provider: 'github',
      remoteName: 'huyz0/gh-repo',
      email: '',
      apiToken: 'ghp_fake-pat',
    }));
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

    await waitFor(() => expect(mockListDeployments).toHaveBeenCalledWith({ buildId: 'build-1', repositoryLinkId: 'link-1', commitSha: 'abc1234def' }));
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
