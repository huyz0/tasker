import { test, expect, type BrowserContext, type Page } from '@playwright/test';
const api = process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080';
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
// Remove credential DOM before automatic failure context, also after timeouts.
const owned = new WeakMap<BrowserContext, { tokenId: string; cookie: string; revoked: boolean }>();
test.afterEach(async ({ context }) => {
  const current = owned.get(context);
  const results = await Promise.allSettled([clearSecret(context), current?.tokenId && !current.revoked ? revoke(current.tokenId, current.cookie) : Promise.resolve()]);
  owned.delete(context);
  if (results.some(result => result.status === 'rejected')) throw new Error('Owned credential or browser cleanup failed.');
});
async function clearSecret(context: BrowserContext) {
  for (const page of context.pages()) {
    try { await page.evaluate(() => navigator.clipboard?.writeText('').catch(() => undefined)); } catch { /* Navigation independently removes DOM. */ }
    try { await page.goto('about:blank', { timeout: 5000 }); }
    catch { await page.close({ runBeforeUnload: false }).catch(() => undefined); }
  }
}
async function adminRpc<T>(page: Page, service: string, method: string, body: object): Promise<T> {
  return page.evaluate(async ({ api, service, method, body }) => {
    const response = await fetch(`${api}/tasker.health.v1.${service}/${method}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Setup request failed (${response.status}).`); return response.json();
  }, { api, service, method, body });
}
async function revoke(tokenId: string, cookie: string) {
  try {
    const response = await fetch(`${api}/tasker.health.v1.AgentService/RevokeAgentToken`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', cookie }, body: JSON.stringify({ tokenId }) });
    if (!response.ok) throw new Error();
  } catch { throw new Error('Could not revoke the owned browser test credential.'); }
}

test('issues least privilege, copies scoped configuration and verifies the exact bearer without cookie fallback', async ({ page, context }) => {
  test.setTimeout(90_000); let tokenId = '', secret = '';
  try {
    await page.goto('/agents'); await expect(page.getByRole('heading', { name: 'AI Agents', level: 1 })).toBeVisible();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    const stamp = Date.now().toString(36), name = `Connection worker ${stamp}`, tokenName = `Browser credential ${stamp}`;
    const { organization } = await adminRpc<{ organization: { id: string } }>(page, 'OrgService', 'SeedOrg', { name: `Connection browser ${stamp}`, slug: `connection-${stamp}` });
    const { role } = await adminRpc<{ role: { id: string } }>(page, 'AgentService', 'CreateAgentRole', { orgId: organization.id, name: 'Release reader', systemPrompt: 'Read authorized evidence.', capabilities: '[]' });
    await page.goto(`/agents?org=${organization.id}`); await page.getByRole('button', { name: 'Register agent', exact: true }).click();
    await page.getByRole('textbox', { name: 'Agent name', exact: true }).fill(name); await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role.id); await page.getByRole('button', { name: 'Register', exact: true }).click();
    const connection = page.getByRole('region', { name: `Connect ${name}`, exact: true });
    owned.set(context, { tokenId: '', cookie: (await context.cookies(api)).map(cookie => `${cookie.name}=${cookie.value}`).join('; '), revoked: false });
    await connection.getByRole('button', { name: 'New token', exact: true }).click(); await expect(connection.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await connection.getByLabel('Name', { exact: true }).fill(tokenName); await connection.getByRole('checkbox', { name: 'tasks:read', exact: true }).check();
    const issuance = page.waitForResponse(response => response.url().endsWith('/CreateAgentToken') && response.request().method() === 'POST'); await connection.getByRole('button', { name: 'Create', exact: true }).click();
    const response = await issuance; expect(response.status()).toBe(200);
    const issued = await response.json() as { token: { id: string; agentId: string; scopes: string[] }; plaintext: string }; tokenId = issued.token.id; secret = issued.plaintext; owned.get(context)!.tokenId = tokenId;
    expect(Boolean(tokenId && secret.startsWith('tskr_'))).toBe(true); expect(issued.token.scopes).toEqual(['tasks:read']);
    await expect(connection.getByRole('heading', { name: 'Save this token', exact: true })).toBeFocused();
    await connection.getByLabel('Configuration format', { exact: true }).selectOption('mcp');
    const preview = await connection.getByLabel('Worker configuration', { exact: true }).textContent(); expect(Boolean(preview?.includes('<TOKEN>') && !preview.includes(secret))).toBe(true);
    await connection.getByRole('button', { name: 'Copy configuration', exact: true }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    let parsed: unknown; try { parsed = JSON.parse(clipboard); } catch { throw new Error('Copied MCP configuration is not valid JSON.'); }
    const copied = parsed as { mcpServers: { tasker: { env: { TASKER_TOKEN: string; TASKER_BACKEND_URL: string; TASKER_ORG_ID: string } } } };
    expect(copied.mcpServers.tasker.env.TASKER_TOKEN === secret).toBe(true); expect(copied.mcpServers.tasker.env.TASKER_BACKEND_URL).toBe(api); expect(copied.mcpServers.tasker.env.TASKER_ORG_ID).toBe(organization.id);
    const identityResponse = page.waitForResponse(response => response.url().endsWith('/GetIdentity') && response.request().method() === 'POST' && response.request().headers().authorization?.startsWith('Bearer ') === true); await connection.getByRole('button', { name: 'Verify token', exact: true }).click();
    const verifiedResponse = await identityResponse; expect(verifiedResponse.status()).toBe(200);
    const headers = await verifiedResponse.request().allHeaders(); expect(headers.authorization === `Bearer ${secret}`).toBe(true); expect(!('cookie' in headers)).toBe(true);
    const identity = await verifiedResponse.json() as { agent?: { id: string; orgId: string; tokenId: string }; user?: object };
    expect(Boolean(!identity.user && identity.agent?.id === issued.token.agentId && identity.agent.orgId === organization.id && identity.agent.tokenId === tokenId)).toBe(true);
    await expect(connection.getByText(/Token verified at/)).toBeVisible();
    expect(await page.evaluate(value => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookies: document.cookie }).includes(value), secret)).toBe(false);
    const probeUrl = `${api}/tasker.health.v1.AuthService/GetIdentity`;
    await page.route(probeUrl, route => route.continue({ headers: { ...route.request().headers(), authorization: 'Bearer tskr_invalid_browser_fixture' } }));
    await connection.getByRole('button', { name: 'Verify token', exact: true }).click(); await expect(connection.getByText('Token refused. It may be expired or revoked.', { exact: true })).toBeVisible(); await expect(connection.getByText(/Token verified at/)).toHaveCount(0);
    await page.unroute(probeUrl); await connection.getByRole('button', { name: 'Verify token', exact: true }).click(); await expect(connection.getByText(/Token verified at/)).toBeVisible();
    await connection.getByRole('button', { name: `Revoke token ${tokenName}`, exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Revoke token', exact: true }).click();
    await expect(connection.getByText(/Token revoked\. Issue a replacement/)).toBeVisible(); owned.get(context)!.revoked = true; await expect(connection.getByRole('region', { name: 'Newly issued credential', exact: true })).toHaveCount(0);
    let status = 0;
    try { status = (await fetch(`${api}/tasker.health.v1.AuthService/GetIdentity`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', authorization: `Bearer ${secret}` }, body: '{}' })).status; }
    catch { throw new Error('Owned revoked-credential check could not reach the API.'); } expect(status).toBe(401);
  } finally { secret = ''; }
});
