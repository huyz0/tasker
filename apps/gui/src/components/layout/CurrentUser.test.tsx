import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'msw';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { server, mockRpc, mockRpcError } from '../../test/mockRpc';
import { BACKEND_URL } from '../../lib/backendUrl';
import { CurrentUser } from './CurrentUser';

const renderIt = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CurrentUser />
    </QueryClientProvider>,
  );
};

const identity = (over: Record<string, unknown> = {}) => ({
  user: { id: 'u-1', email: 'ada@example.com', name: 'Ada Lovelace', avatarUrl: '', createdAt: '', ...over },
});

describe('CurrentUser', () => {
  it('shows the signed-in account, not a generic icon', async () => {
    mockRpc(AuthService, 'GetIdentity', identity());
    renderIt();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the avatar when the account has one', async () => {
    mockRpc(AuthService, 'GetIdentity', identity({ avatarUrl: 'https://example.test/a.png' }));
    renderIt();
    const img = await screen.findByRole('img', { name: 'Ada Lovelace' });
    expect(img).toHaveAttribute('src', 'https://example.test/a.png');
  });

  it('falls back to an initial derived from the name, never a placeholder letter', async () => {
    mockRpc(AuthService, 'GetIdentity', identity({ avatarUrl: '' }));
    renderIt();
    // "A" for Ada. The point of M05-T02 was that a literal "U" is a lie; an
    // initial computed from the real name is not.
    await waitFor(() => expect(screen.getByTestId('current-user-initial')).toHaveTextContent('A'));
  });

  it('falls back to the email when the account has no name', async () => {
    mockRpc(AuthService, 'GetIdentity', identity({ name: '' }));
    renderIt();
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('current-user-initial')).toHaveTextContent('A');
  });

  it('shows nothing rather than a fake identity while loading', () => {
    // A handler that never resolves — the network-level equivalent of the
    // original mock's `new Promise(() => {})` — so the request is genuinely
    // in flight when the assertions run below.
    server.use(
      http.post(`${BACKEND_URL}/${AuthService.typeName}/GetIdentity`, () => new Promise(() => {})),
    );
    renderIt();
    expect(screen.queryByTestId('current-user-initial')).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('shows nothing when the identity cannot be resolved', async () => {
    // A signed-out or failed state must not fall back to a stand-in avatar —
    // that is the fabrication this milestone exists to remove.
    mockRpcError(AuthService, 'GetIdentity', 'unauthenticated', 'not signed in');
    const { container } = renderIt();
    await waitFor(() => expect(container.querySelector('[data-testid="current-user-initial"]')).toBeNull());
  });

  it('exposes the account to assistive technology as a labelled group', async () => {
    mockRpc(AuthService, 'GetIdentity', identity());
    renderIt();
    expect(await screen.findByLabelText('Signed in as Ada Lovelace')).toBeInTheDocument();
  });
});
