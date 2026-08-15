import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CurrentUser } from './CurrentUser';

const mockGetIdentity = vi.fn();

vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: () => ({ getIdentity: (...a: unknown[]) => mockGetIdentity(...a) }),
}));

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

beforeEach(() => vi.clearAllMocks());

describe('CurrentUser', () => {
  it('shows the signed-in account, not a generic icon', async () => {
    mockGetIdentity.mockResolvedValue(identity());
    renderIt();
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('renders the avatar when the account has one', async () => {
    mockGetIdentity.mockResolvedValue(identity({ avatarUrl: 'https://example.test/a.png' }));
    renderIt();
    const img = await screen.findByRole('img', { name: 'Ada Lovelace' });
    expect(img).toHaveAttribute('src', 'https://example.test/a.png');
  });

  it('falls back to an initial derived from the name, never a placeholder letter', async () => {
    mockGetIdentity.mockResolvedValue(identity({ avatarUrl: '' }));
    renderIt();
    // "A" for Ada. The point of M05-T02 was that a literal "U" is a lie; an
    // initial computed from the real name is not.
    await waitFor(() => expect(screen.getByTestId('current-user-initial')).toHaveTextContent('A'));
  });

  it('falls back to the email when the account has no name', async () => {
    mockGetIdentity.mockResolvedValue(identity({ name: '' }));
    renderIt();
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('current-user-initial')).toHaveTextContent('A');
  });

  it('shows nothing rather than a fake identity while loading', () => {
    mockGetIdentity.mockReturnValue(new Promise(() => {}));
    renderIt();
    expect(screen.queryByTestId('current-user-initial')).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('shows nothing when the identity cannot be resolved', async () => {
    // A signed-out or failed state must not fall back to a stand-in avatar —
    // that is the fabrication this milestone exists to remove.
    mockGetIdentity.mockRejectedValue(new Error('unauthenticated'));
    const { container } = renderIt();
    await waitFor(() => expect(container.querySelector('[data-testid="current-user-initial"]')).toBeNull());
  });

  it('exposes the account to assistive technology as a labelled group', async () => {
    mockGetIdentity.mockResolvedValue(identity());
    renderIt();
    expect(await screen.findByLabelText('Signed in as Ada Lovelace')).toBeInTheDocument();
  });
});
