import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentTokens } from './AgentTokens';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockRevoke = vi.fn();

vi.mock('@connectrpc/connect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@connectrpc/connect')>()),
  createClient: () => ({
    listAgentTokens: (...a: unknown[]) => mockList(...a),
    createAgentToken: (...a: unknown[]) => mockCreate(...a),
    revokeAgentToken: (...a: unknown[]) => mockRevoke(...a),
  }),
}));

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AgentTokens agentId="agent-1" agentName="Reviewer Bot" />
    </QueryClientProvider>,
  );
};

const aToken = (over: Record<string, unknown> = {}) => ({
  id: 'tok-1', agentId: 'agent-1', orgId: 'org-1', name: 'CI worker',
  tokenPrefix: 'tskr_ab12', scopes: ['tasks:read'], createdAt: '', expiresAt: '2026-11-13T00:00:00Z',
  lastUsedAt: '', revokedAt: '', expired: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue({ tokens: [] });
});

describe('AgentTokens', () => {
  it('shows an empty state rather than nothing when the agent has no tokens', async () => {
    renderPanel();
    expect(await screen.findByText('No tokens for this agent.')).toBeInTheDocument();
  });

  it('is absent entirely for a non-admin, rather than rendering a permission error', async () => {
    mockList.mockRejectedValue(new Error('permission_denied'));
    const { container } = renderPanel();
    // listAgentTokens is admin-gated. Same call as M03-T13's invitations
    // section: do not offer what cannot be used.
    await waitFor(() => expect(container.querySelector('h3')).toBeNull());
  });

  it('lists a token by prefix and state, never by secret', async () => {
    mockList.mockResolvedValue({ tokens: [aToken()] });
    renderPanel();
    expect(await screen.findByText('tskr_ab12…')).toBeInTheDocument();
    expect(screen.getByText('CI worker')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('distinguishes revoked and expired from active', async () => {
    mockList.mockResolvedValue({
      tokens: [
        aToken({ id: 't1', name: 'Dead', revokedAt: '2026-08-01T00:00:00Z' }),
        aToken({ id: 't2', name: 'Old', expired: true }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('revoked')).toBeInTheDocument();
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('offers no revoke button for a token that is already dead', async () => {
    mockList.mockResolvedValue({ tokens: [aToken({ name: 'Dead', revokedAt: '2026-08-01T00:00:00Z' })] });
    renderPanel();
    await screen.findByText('revoked');
    expect(screen.queryByLabelText('Revoke token Dead')).toBeNull();
  });

  it('creates a token with the chosen scopes and shows the secret once', async () => {
    mockCreate.mockResolvedValue({
      token: aToken({ scopes: ['tasks:read', 'tasks:write'] }),
      plaintext: 'tskr_ab12thesecret',
    });
    renderPanel();
    await screen.findByText('No tokens for this agent.');

    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI worker' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:write' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
      agentId: 'agent-1', name: 'CI worker', scopes: ['tasks:read', 'tasks:write'], expiresInDays: 0,
    }));
    expect(await screen.findByText('tskr_ab12thesecret')).toBeInTheDocument();
    expect(screen.getByText(/only time this token will be shown/)).toBeInTheDocument();
  });

  it('keeps the secret on screen until it is dismissed by hand', async () => {
    mockCreate.mockResolvedValue({ token: aToken(), plaintext: 'tskr_secret' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const secret = await screen.findByText('tskr_secret');
    // No timeout, no auto-dismiss: a timer expiring while someone switches to
    // their password manager destroys the only copy that exists.
    await new Promise((r) => setTimeout(r, 50));
    expect(secret).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByText('tskr_secret')).toBeNull());
  });

  it('says so when the clipboard is unavailable instead of failing silently', async () => {
    mockCreate.mockResolvedValue({ token: aToken(), plaintext: 'tskr_secret' });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('tskr_secret');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    // Silent failure here loses the value permanently.
    expect(await screen.findByText(/Could not copy automatically/)).toBeInTheDocument();
  });

  it('copies when the clipboard works', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    mockCreate.mockResolvedValue({ token: aToken(), plaintext: 'tskr_secret' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('tskr_secret');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('tskr_secret'));
  });

  it('cannot submit with no scopes selected', async () => {
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI worker' } });
    // Nothing is pre-checked on purpose: a default set is how a credential
    // ends up with more authority than the issuer thought about.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('forwards an explicit expiry', async () => {
    mockCreate.mockResolvedValue({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ expiresInDays: 30 })));
  });

  it('keeps what was typed when creation fails', async () => {
    mockCreate.mockRejectedValue(new Error('permission denied'));
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI worker' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/Failed to create token/)).toBeInTheDocument();
    // Clearing here makes someone retype a name they just chose, in exactly
    // the situation where they are already annoyed.
    expect(screen.getByLabelText('Name')).toHaveValue('CI worker');
  });

  it('revokes after confirmation', async () => {
    mockList.mockResolvedValue({ tokens: [aToken()] });
    mockRevoke.mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith({ tokenId: 'tok-1' }));
  });

  it('does not revoke when the confirmation is cancelled', async () => {
    mockList.mockResolvedValue({ tokens: [aToken()] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('shows a loading line while the query is in flight', async () => {
    let resolve!: (v: unknown) => void;
    mockList.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPanel();
    expect(await screen.findByText('Loading tokens...')).toBeInTheDocument();
    resolve({ tokens: [] });
    await screen.findByText('No tokens for this agent.');
  });

  it('unchecking a scope removes it', async () => {
    mockCreate.mockResolvedValue({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:write' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['tasks:write'] })));
  });

  it('disables the submit button while the request is in flight', async () => {
    mockCreate.mockReturnValue(new Promise(() => {}));
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // Double-submitting here issues two credentials, and the second one's
    // plaintext replaces the first on screen before anyone has copied it.
    expect(await screen.findByRole('button', { name: 'Creating...' })).toBeDisabled();
  });

  it('describes remaining life in days, and gets the singular right', async () => {
    const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
    mockList.mockResolvedValue({ tokens: [
      aToken({ id: 'a', name: 'Tomorrow', expiresAt: inDays(1) }),
      aToken({ id: 'b', name: 'Today', expiresAt: inDays(0) }),
      aToken({ id: 'c', name: 'Later', expiresAt: inDays(30) }),
    ] });
    renderPanel();
    expect(await screen.findByText('expires in 1 day')).toBeInTheDocument();
    expect(screen.getByText('expires today')).toBeInTheDocument();
    expect(screen.getByText('expires in 30 days')).toBeInTheDocument();
  });

  it('keeps the row and explains when revocation fails', async () => {
    mockList.mockResolvedValue({ tokens: [aToken()] });
    mockRevoke.mockRejectedValue(new Error('nope'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    expect(await screen.findByText(/Failed to revoke token/)).toBeInTheDocument();
    // The token still exists, so the row still belongs there.
    expect(screen.getByText('CI worker')).toBeInTheDocument();
  });
});
