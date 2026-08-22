import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError } from '../test/mockRpc';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { OAuthCallback } from './OAuthCallback';
import { expectNoA11yViolations } from '../test/a11y';

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

/** Registers the link RPC and records every request it receives. */
function withAddRepositoryLink(response: object = { link: { id: 'link-1', projectId: 'proj-1' } }) {
  const requests: any[] = [];
  mockRpc(RepositoryService, 'AddRepositoryLink', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

describe('OAuthCallback', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    sessionStorage.clear();
  });

  it('completes the link when the state nonce matches the one this tab stored before redirecting', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-abc');
    const requests = withAddRepositoryLink();

    const state = encodeState({ projectId: 'proj-1', provider: 'github', remoteName: 'huyz0/tasker', nonce: 'nonce-abc' });
    renderAt(`?code=abc123&state=${state}`);

    await waitFor(() => expect(requests).toContainEqual({
      projectId: 'proj-1',
      provider: 'github',
      remoteName: 'huyz0/tasker',
      oauthCode: 'abc123',
    }));
  });

  it('rejects the callback when the state nonce does not match sessionStorage (login CSRF)', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-real');
    const requests = withAddRepositoryLink();

    const state = encodeState({ projectId: 'victim-proj', provider: 'github', remoteName: 'attacker/repo', nonce: 'attacker-supplied-nonce' });
    renderAt(`?code=attacker-code&state=${state}`);

    await waitFor(() => expect(screen.getByText(/doesn't match a repository link you started/)).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it('does not misreport a nonce mismatch or double-submit the oauthCode under StrictMode double-invoke', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-strict');
    const requests = withAddRepositoryLink();

    const state = encodeState({ projectId: 'proj-1', provider: 'github', remoteName: 'huyz0/tasker', nonce: 'nonce-strict' });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/oauth/callback?code=abc123&state=${state}`]}>
            <OAuthCallback />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(screen.queryByText(/doesn't match a repository link you started/)).toBeNull();
  });

  it('rejects the callback when there is no oauth nonce in sessionStorage at all', async () => {
    const requests = withAddRepositoryLink();
    const state = encodeState({ projectId: 'victim-proj', provider: 'github', remoteName: 'attacker/repo', nonce: 'attacker-supplied-nonce' });
    renderAt(`?code=attacker-code&state=${state}`);

    await waitFor(() => expect(screen.getByText(/doesn't match a repository link you started/)).toBeDefined());
    expect(requests).toHaveLength(0);
  });

  it('shows an error when there is no authorization code in the URL', async () => {
    renderAt('');
    await waitFor(() => expect(screen.getByText('No authorization code found in URL.')).toBeDefined());
  });

  it('shows an error when there is no state parameter in the URL', async () => {
    renderAt('?code=abc123');
    await waitFor(() => expect(screen.getByText('No state parameter found. Cannot determine project to link.')).toBeDefined());
  });

  it('shows an error when the state parameter cannot be parsed', async () => {
    renderAt('?code=abc123&state=not-valid-base64-json!!!');
    await waitFor(() => expect(screen.getByText('Invalid state parameter.')).toBeDefined());
  });

  it('shows an error message and a way back when the link mutation fails', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-abc');
    mockRpcError(RepositoryService, 'AddRepositoryLink', 'internal', 'provider rejected the code');

    const state = encodeState({ projectId: 'proj-1', provider: 'github', remoteName: 'huyz0/tasker', nonce: 'nonce-abc' });
    renderAt(`?code=abc123&state=${state}`);

    await waitFor(() => expect(screen.getByText(/provider rejected the code/)).toBeDefined());
    screen.getByRole('button', { name: 'Return to Projects' }).click();
    expect(mockNavigate).toHaveBeenCalledWith('/projects');
  });

  it('navigates to projects on a successful link', async () => {
    sessionStorage.setItem('repoLinkOauthNonce', 'nonce-abc');
    withAddRepositoryLink();

    const state = encodeState({ projectId: 'proj-1', provider: 'github', remoteName: 'huyz0/tasker', nonce: 'nonce-abc' });
    renderAt(`?code=abc123&state=${state}`);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/projects'));
  });

  it('has no accessibility violations', async () => {
    const { container } = renderAt('?code=abc&state=' + encodeState({ nonce: 'n' }));
    await expectNoA11yViolations(container);
  });
});
