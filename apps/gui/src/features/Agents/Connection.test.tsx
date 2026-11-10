import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentService, AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { mockRpc, mockRpcError, mockRpcPending, server } from '../../test/mockRpc';
import { AgentTokens } from './AgentTokens';
import { http, HttpResponse } from 'msw';
import { BACKEND_URL } from '../../lib/backendUrl';
import { confirmAction } from '../../test/confirm';

const metadata = { id: 'token-1', agentId: 'agent-1', orgId: 'org-1', name: 'Release worker', scopes: ['tasks:read'], tokenPrefix: 'tskr_demo', expiresAt: '2030-01-01T00:00:00Z' };
const identity = { id: 'agent-1', orgId: 'org-1', tokenId: 'token-1', scopes: ['tasks:read'], name: 'Release worker' };
const secret = 'tskr_fake_connection_fixture';
const props = { agentId: 'agent-1', agentName: 'Release worker', accountId: 'user-1', orgId: 'org-1', projectId: 'project-1' };
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const element = (value = props) => <QueryClientProvider client={client}><AgentTokens {...value} /></QueryClientProvider>;
  const ui = render(element()); return { ...ui, client, change: (value: typeof props) => ui.rerender(element(value)) };
}
async function form() {
  fireEvent.click(await screen.findByRole('button', { name: 'New token' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Release worker' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' }));
}
async function issue() { await form(); fireEvent.click(screen.getByRole('button', { name: 'Create' })); await screen.findByText(secret); }
function noSecretCache(client: QueryClient) {
  expect(JSON.stringify(client.getQueryCache().getAll().map(query => [query.queryKey, query.state.data]))).not.toContain(secret);
  expect(JSON.stringify(client.getMutationCache().getAll().map(mutation => mutation.state))).not.toContain(secret);
}
beforeEach(() => {
  server.use(http.post(`${BACKEND_URL}/api/client-errors`, () => HttpResponse.json({})));
  mockRpc(AgentService, 'ListAgentTokens', { tokens: [] });
  mockRpc(AgentService, 'CreateAgentToken', { token: metadata, plaintext: secret });
  mockRpc(AuthService, 'GetIdentity', { agent: identity });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('one-time external worker connection', () => {
  it('gives useful unavailable guidance and retry instead of hiding denied administration', async () => {
    mockRpcError(AgentService, 'ListAgentTokens', 'permission_denied', 'admin required'); view();
    expect(await screen.findByText(/Token administration is unavailable/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New token' })).not.toBeInTheDocument();
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [] }); fireEvent.click(screen.getByRole('button', { name: 'Retry tokens' }));
    expect(await screen.findByRole('button', { name: 'New token' })).toBeVisible();
  });
  it('keeps a selectable secret outside live announcements and shows placeholder configuration', async () => {
    const { client } = view(); await issue();
    expect(screen.getByRole('heading', { name: 'Save this token' })).toBeVisible();
    expect(screen.getByText(secret).closest('[role="status"], [aria-live]')).toBeNull();
    const preview = screen.getByLabelText('Worker configuration'); expect(preview.textContent).toContain('<TOKEN>'); expect(preview.textContent).not.toContain(secret);
    expect(preview.textContent).toContain('project-1'); expect(preview.textContent).toContain('org-1');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); noSecretCache(client);
    fireEvent.click(screen.getByRole('button', { name: 'Copy configuration' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(secret)));
    fireEvent.click(screen.getByRole('button', { name: "I've saved it" })); expect(screen.queryByText(secret)).not.toBeInTheDocument(); noSecretCache(client);
    expect(screen.getByText(/Lost this token/)).toBeVisible();
  });
  it('freezes issuance fields and retires a canceled request without losing the next draft', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgentToken'); const { client } = view(); await form();
    fireEvent.click(screen.getByRole('button', { name: 'Create' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    expect(screen.getByLabelText('Name')).toBeDisabled(); expect(screen.getByRole('checkbox', { name: 'tasks:read' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Later draft' } });
    await act(async () => pending.resolve({ token: metadata, plaintext: secret }));
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); expect(screen.getByLabelText('Name')).toHaveValue('Later draft'); noSecretCache(client);
  });
  it.each(['accountId', 'orgId', 'agentId'] as const)('retires late issuance across a confirmed %s change', async field => {
    const pending = mockRpcPending(AgentService, 'CreateAgentToken'); const ui = view(); await form(); fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1)); ui.change({ ...props, [field]: 'new-scope' });
    await screen.findByRole('button', { name: 'New token' }); await act(async () => pending.resolve({ token: metadata, plaintext: secret }));
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); noSecretCache(ui.client);
  });
  it('verifies only the current exact credential and labels the result as an API request', async () => {
    view(); await issue(); expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); expect(await screen.findByText(/Token verified at/)).toBeVisible();
    expect(screen.getByText(/does not prove the external worker is running/)).toBeVisible();
    mockRpcError(AuthService, 'GetIdentity', 'unauthenticated', secret);
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByText('Token refused. It may be expired or revoked.')).toBeVisible(); expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument();
    expect(screen.getAllByText(secret)).toHaveLength(1);
  });
  it('refuses a human session result and permits a fresh credential retry', async () => {
    mockRpc(AuthService, 'GetIdentity', { user: { id: 'admin', name: 'Administrator' } }); view(); await issue();
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); expect(await screen.findByText('The API returned a different identity.')).toBeVisible();
    expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument(); mockRpc(AuthService, 'GetIdentity', { agent: identity });
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); expect(await screen.findByText(/Token verified at/)).toBeVisible();
  });
  it('dismisses a pending verification without allowing its late result to return', async () => {
    const pending = mockRpcPending(AuthService, 'GetIdentity'); const { client } = view(); await issue();
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); await waitFor(() => expect(pending.requests).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: "I've saved it" })); await act(async () => pending.resolve({ agent: identity }));
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument(); noSecretCache(client);
  });
  it('does not let a retired verification overwrite a replacement credential', async () => {
    const pending = mockRpcPending(AuthService, 'GetIdentity'); view(); await issue(); fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1)); fireEvent.click(screen.getByRole('button', { name: 'New token' }));
    mockRpc(AgentService, 'CreateAgentToken', { token: { ...metadata, id: 'token-2' }, plaintext: 'tskr_fake_replacement' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Replacement' } }); fireEvent.click(screen.getByRole('checkbox', { name: 'tasks:read' })); fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('tskr_fake_replacement'); await act(async () => pending.resolve({ agent: identity }));
    expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument(); expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });
  it('revokes the current token and retires its verification with replacement guidance', async () => {
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [metadata] }); mockRpc(AgentService, 'RevokeAgentToken', { success: true }); view(); await issue();
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); await screen.findByText(/Token verified at/);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke token Release worker' })); await confirmAction();
    await waitFor(() => expect(screen.queryByText(secret)).not.toBeInTheDocument()); expect(screen.queryByText(/Token verified at/)).not.toBeInTheDocument();
    expect(screen.getByText(/Token revoked/)).toBeVisible();
  });
  it('retires the secret on a newly denied administration read', async () => {
    const ui = view(); await issue(); mockRpcError(AgentService, 'ListAgentTokens', 'permission_denied', 'admin removed');
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['agentTokens'] }); });
    expect(await screen.findByText(/Token administration is unavailable/)).toBeVisible(); expect(screen.queryByText(secret)).not.toBeInTheDocument(); noSecretCache(ui.client);
  });
  it('keeps manual token selection and truthful retry when copying fails', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined); Object.assign(navigator, { clipboard: { writeText: write } });
    view(); await issue(); fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    expect(await screen.findByText(/Could not copy automatically/)).toBeVisible(); expect(screen.getByText(secret)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copy token' })); expect(await screen.findByText('Token copied.')).toBeVisible();
  });
  it('focuses the revealed credential heading once without stealing later focus', async () => {
    view(); await issue(); expect(screen.getByRole('heading', { name: 'Save this token' })).toHaveFocus();
    screen.getByRole('button', { name: 'Copy token' }).focus();
    fireEvent.change(screen.getByLabelText('Configuration format'), { target: { value: 'mcp' } });
    expect(screen.getByRole('button', { name: 'Copy token' })).toHaveFocus();
  });
  it('refreshes recorded token use after the real verification request succeeds', async () => {
    let used = false;
    mockRpc(AgentService, 'ListAgentTokens', () => ({ tokens: [{ ...metadata, lastUsedAt: used ? '2026-11-10T10:00:00Z' : '' }] }));
    mockRpc(AuthService, 'GetIdentity', () => { used = true; return { agent: identity }; });
    view(); await issue(); expect(screen.getByText('never used')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' })); await screen.findByText(/Token verified at/);
    await waitFor(() => expect(screen.queryByText('never used')).not.toBeInTheDocument());
  });

  it('preserves the only secret during a transient token-list failure and permits retry', async () => {
    const ui = view(); await issue(); mockRpcError(AgentService, 'ListAgentTokens', 'unavailable', 'offline');
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['agentTokens'] }); });
    expect(await screen.findByText(/Could not refresh token metadata/)).toBeVisible();
    expect(screen.getByText(secret)).toBeVisible(); expect(screen.getByRole('button', { name: 'Copy token' })).toBeEnabled();
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [] }); fireEvent.click(screen.getByRole('button', { name: 'Retry tokens' }));
    await waitFor(() => expect(screen.queryByText(/Could not refresh token metadata/)).not.toBeInTheDocument());
    expect(screen.getByText(secret)).toBeVisible();
  });

  it('rejects an issuance response missing the token identity needed for verification', async () => {
    mockRpc(AgentService, 'CreateAgentToken', { token: { ...metadata, id: '' }, plaintext: secret }); view(); await form();
    fireEvent.click(screen.getByRole('button', { name: 'Create' })); expect(await screen.findByText(/Failed to create token/)).toBeVisible();
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); expect(screen.getByLabelText('Name')).toHaveValue('Release worker');
  });
  it('explains revoke and replacement when reopening metadata after losing a secret', async () => {
    const ui = view(); await issue(); fireEvent.click(screen.getByRole('button', { name: "I've saved it" })); ui.unmount();
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [metadata] }); view();
    expect(await screen.findByText(/Secrets cannot be recovered/)).toBeVisible(); expect(screen.getByRole('button', { name: 'Revoke token Release worker' })).toBeVisible();
    expect(screen.queryByText(secret)).not.toBeInTheDocument();
  });

  it('keeps cached administration fenced after denial, another agent and transient failures until a fresh read succeeds', async () => {
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [metadata] }); const ui = view();
    await screen.findByRole('button', { name: 'New token' });
    ui.change({ ...props, agentId: 'agent-2' }); await screen.findByRole('button', { name: 'New token' });
    mockRpcError(AgentService, 'ListAgentTokens', 'permission_denied', 'Administrator role removed');
    await act(async () => { await ui.client.invalidateQueries({ queryKey: ['agentTokens'] }); });
    await screen.findByText(/Token administration is unavailable/);
    mockRpcError(AgentService, 'ListAgentTokens', 'unavailable', 'Temporary outage');
    ui.change(props); await screen.findByText(/Token administration is unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry tokens' }));
    await waitFor(() => expect(ui.client.isFetching({ queryKey: ['agentTokens'] })).toBe(0));
    expect(screen.queryByRole('button', { name: 'New token' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke token Release worker' })).not.toBeInTheDocument();
    mockRpc(AgentService, 'ListAgentTokens', { tokens: [metadata] }); fireEvent.click(screen.getByRole('button', { name: 'Retry tokens' }));
    expect(await screen.findByRole('button', { name: 'New token' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Revoke token Release worker' })).toBeVisible();
  });

  it('retires issuance across a denial and recovery even when rendering batches both read results', async () => {
    const pending = mockRpcPending(AgentService, 'CreateAgentToken'); const ui = view(); await form(); fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(pending.requests).toHaveLength(1));
    await act(async () => {
      mockRpcError(AgentService, 'ListAgentTokens', 'permission_denied', 'Administrator role removed');
      await ui.client.refetchQueries({ queryKey: ['agentTokens'] });
      mockRpc(AgentService, 'ListAgentTokens', { tokens: [metadata] });
      await ui.client.refetchQueries({ queryKey: ['agentTokens'] });
      pending.resolve({ token: metadata, plaintext: secret });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(ui.client.isMutating()).toBe(0));
    expect(screen.queryByText(secret)).not.toBeInTheDocument(); noSecretCache(ui.client);
  });

});
