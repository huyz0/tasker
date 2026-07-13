import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockAddRepositoryLink, mockNavigate } = vi.hoisted(() => ({
  mockAddRepositoryLink: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: vi.fn(() => ({})),
}));
vi.mock('@connectrpc/connect', () => ({
  createClient: vi.fn(() => ({ addRepositoryLink: mockAddRepositoryLink })),
}));
vi.mock('shared-contract/gen/ts/tasker/health/v1/health_pb', () => ({
  RepositoryService: 'RepositoryService',
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { OAuthCallback } from './OAuthCallback';

function renderAt(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/oauth/callback${search}`]}>
        <OAuthCallback />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function encodeState(state: object) {
  return btoa(JSON.stringify(state));
}

describe('OAuthCallback', () => {
  beforeEach(() => {
    mockAddRepositoryLink.mockReset();
    mockNavigate.mockReset();
    sessionStorage.clear();
  });

  it('completes the link when the state nonce matches the one this tab stored before redirecting', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-abc');
    mockAddRepositoryLink.mockResolvedValue({ link: { id: 'link-1', projectId: 'proj-1' } });

    const state = encodeState({ projectId: 'proj-1', provider: 'github', remoteName: 'huyz0/tasker', nonce: 'nonce-abc' });
    renderAt(`?code=abc123&state=${state}`);

    await waitFor(() => expect(mockAddRepositoryLink).toHaveBeenCalledWith({
      projectId: 'proj-1',
      provider: 'github',
      remoteName: 'huyz0/tasker',
      oauthCode: 'abc123',
    }));
  });

  it('rejects the callback when the state nonce does not match sessionStorage (login CSRF)', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-real');

    const state = encodeState({ projectId: 'victim-proj', provider: 'github', remoteName: 'attacker/repo', nonce: 'attacker-supplied-nonce' });
    renderAt(`?code=attacker-code&state=${state}`);

    await waitFor(() => expect(screen.getByText(/doesn't match a repository link you started/)).toBeDefined());
    expect(mockAddRepositoryLink).not.toHaveBeenCalled();
  });

  it('rejects the callback when there is no oauth nonce in sessionStorage at all', async () => {
    const state = encodeState({ projectId: 'victim-proj', provider: 'github', remoteName: 'attacker/repo', nonce: 'attacker-supplied-nonce' });
    renderAt(`?code=attacker-code&state=${state}`);

    await waitFor(() => expect(screen.getByText(/doesn't match a repository link you started/)).toBeDefined());
    expect(mockAddRepositoryLink).not.toHaveBeenCalled();
  });
});
