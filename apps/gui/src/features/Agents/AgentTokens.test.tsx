import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending } from '../../test/mockRpc';
import { AgentTokens } from './AgentTokens';
import { confirmAction, cancelAction } from '../../test/confirm';

/** Registers ListAgentTokens and records every request it receives. */
function withListTokens(response: object = { tokens: [] }) {
  const requests: any[] = [];
  mockRpc(AgentService, 'ListAgentTokens', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers CreateAgentToken and records every request it receives. */
function withCreateToken(response: object) {
  const requests: any[] = [];
  mockRpc(AgentService, 'CreateAgentToken', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

/** Registers RevokeAgentToken and records every request it receives. */
function withRevokeToken(response: object = { success: true }) {
  const requests: any[] = [];
  mockRpc(AgentService, 'RevokeAgentToken', (body) => {
    requests.push(body);
    return response;
  });
  return requests;
}

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

describe('AgentTokens', () => {
  it('shows an empty state rather than nothing when the agent has no tokens', async () => {
    withListTokens();
    renderPanel();
    expect(await screen.findByText('No tokens for this agent.')).toBeInTheDocument();
  });

  it('is absent entirely for a non-admin, rather than rendering a permission error', async () => {
    mockRpcError(AgentService, 'ListAgentTokens', 'permission_denied', 'permission_denied');
    const { container } = renderPanel();
    // listAgentTokens is admin-gated. Same call as M03-T13's invitations
    // section: do not offer what cannot be used.
    await waitFor(() => expect(container.querySelector('h3')).toBeNull());
  });

  it('lists a token by prefix and state, never by secret', async () => {
    withListTokens({ tokens: [aToken()] });
    renderPanel();
    expect(await screen.findByText('tskr_ab12…')).toBeInTheDocument();
    expect(screen.getByText('CI worker')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('distinguishes revoked and expired from active', async () => {
    withListTokens({
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
    withListTokens({ tokens: [aToken({ name: 'Dead', revokedAt: '2026-08-01T00:00:00Z' })] });
    renderPanel();
    await screen.findByText('revoked');
    expect(screen.queryByLabelText('Revoke token Dead')).toBeNull();
  });

  it('creates a token with the chosen scopes and shows the secret once', async () => {
    withListTokens();
    const requests = withCreateToken({
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

    // `expiresInDays: 0` is proto3's default for an int32 field, so the real
    // JSON codec omits it from the wire rather than sending 0.
    await waitFor(() => expect(requests).toContainEqual({
      agentId: 'agent-1', name: 'CI worker', scopes: ['tasks:read', 'tasks:write'],
    }));
    expect(await screen.findByText('tskr_ab12thesecret')).toBeInTheDocument();
    expect(screen.getByText(/only time this token will be shown/)).toBeInTheDocument();
  });

  it('keeps the secret on screen until it is dismissed by hand', async () => {
    withListTokens();
    withCreateToken({ token: aToken(), plaintext: 'tskr_secret' });
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
    withListTokens();
    withCreateToken({ token: aToken(), plaintext: 'tskr_secret' });
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
    withListTokens();
    withCreateToken({ token: aToken(), plaintext: 'tskr_secret' });
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
    withListTokens();
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'CI worker' } });
    // Nothing is pre-checked on purpose: a default set is how a credential
    // ends up with more authority than the issuer thought about.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('forwards an explicit expiry', async () => {
    withListTokens();
    const requests = withCreateToken({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ expiresInDays: 30 })));
  });

  it('keeps what was typed when creation fails', async () => {
    withListTokens();
    mockRpcError(AgentService, 'CreateAgentToken', 'permission_denied', 'permission denied');
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
    withListTokens({ tokens: [aToken()] });
    const requests = withRevokeToken();
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    await confirmAction();
    await waitFor(() => expect(requests).toContainEqual({ tokenId: 'tok-1' }));
  });

  it('does not revoke when the confirmation is cancelled', async () => {
    withListTokens({ tokens: [aToken()] });
    const requests = withRevokeToken();
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    await cancelAction();
    expect(requests).toHaveLength(0);
  });

  it('shows a loading line while the query is in flight', async () => {
    mockRpcPending(AgentService, 'ListAgentTokens');
    renderPanel();
    expect(await screen.findByText('Loading tokens...')).toBeInTheDocument();
  });

  it('unchecking a scope removes it', async () => {
    withListTokens();
    const requests = withCreateToken({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:write' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ scopes: ['tasks:write'] })));
  });

  it('disables the submit button while the request is in flight', async () => {
    withListTokens();
    mockRpcPending(AgentService, 'CreateAgentToken');
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
    withListTokens({ tokens: [
      aToken({ id: 'a', name: 'Tomorrow', expiresAt: inDays(1) }),
      aToken({ id: 'b', name: 'Today', expiresAt: inDays(0) }),
      aToken({ id: 'c', name: 'Later', expiresAt: inDays(30) }),
    ] });
    renderPanel();
    expect(await screen.findByText('expires in 1 day')).toBeInTheDocument();
    expect(screen.getByText('expires today')).toBeInTheDocument();
    expect(screen.getByText('expires in 30 days')).toBeInTheDocument();
  });

  it('shows "never used" for a token with no lastUsedAt, and the date once it has one', async () => {
    withListTokens({ tokens: [
      aToken({ id: 'a', name: 'Fresh', lastUsedAt: '' }),
      aToken({ id: 'b', name: 'Seasoned', lastUsedAt: '2026-08-01T00:00:00Z' }),
    ] });
    renderPanel();
    expect(await screen.findByText('never used')).toBeInTheDocument();
    expect(screen.getByText(/^used /)).toBeInTheDocument();
  });

  // M17-T04: ADR-0008's 365-day maximum was stated in the helper text but not
  // enforced client-side - only the server rejected an out-of-range value.
  it('rejects an expiry over the 365-day maximum before submitting', async () => {
    withListTokens();
    const requests = withCreateToken({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '400' } });

    expect(screen.getByText('Cannot exceed 365 days.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(requests).toHaveLength(0);
  });

  it('rejects a non-whole-number expiry', async () => {
    withListTokens();
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '0' } });

    expect(screen.getByText('Must be a whole number of days.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('allows exactly the 365-day maximum', async () => {
    withListTokens();
    const requests = withCreateToken({ token: aToken(), plaintext: 'x' });
    renderPanel();
    await screen.findByText('No tokens for this agent.');
    fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
    fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: '365' } });

    expect(screen.queryByText('Cannot exceed 365 days.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(requests).toContainEqual(expect.objectContaining({ expiresInDays: 365 })));
  });

  it('keeps the row and explains when revocation fails', async () => {
    withListTokens({ tokens: [aToken()] });
    mockRpcError(AgentService, 'RevokeAgentToken', 'unknown', 'nope');
    renderPanel();

    fireEvent.click(await screen.findByLabelText('Revoke token CI worker'));
    await confirmAction();
    expect(await screen.findByText(/Failed to revoke token/)).toBeInTheDocument();
    // The token still exists, so the row still belongs there.
    expect(screen.getByText('CI worker')).toBeInTheDocument();
  });
});
