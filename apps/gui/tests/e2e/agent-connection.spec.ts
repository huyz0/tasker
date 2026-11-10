import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const api = process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080';
test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 375, height: 900 } });
test.beforeEach(async ({ context }) => {
  if (process.env.TASKER_E2E_PRODUCTION === '1') {
    const response = await context.request.get(`${api}/api/auth/test/inject?userId=dev-user`);
    if (!response.ok()) throw new Error('Owned production-preview login failed.');
  }
});
// Remove credential DOM before automatic failure context, also after timeouts.
interface OwnedCredential { tokenId: string; agentId: string; tokenName: string; cookie: string; revoked: boolean; issuanceStarted: boolean; }
const owned = new WeakMap<BrowserContext, OwnedCredential>();
test.afterEach(async ({ context }) => {
  const current = owned.get(context);
  const results = await Promise.allSettled([clearSecret(context), current?.issuanceStarted && !current.revoked ? revoke(current) : Promise.resolve()]);
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
async function revoke(current: OwnedCredential) {
  const call = async (method: string, body: object) => {
    try {
      const response = await fetch(`${api}/tasker.health.v1.AgentService/${method}`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', cookie: current.cookie }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(); return await response.json();
    } catch { throw new Error('Owned test credential cleanup request failed.'); }
  };
  let ids = current.tokenId ? [current.tokenId] : [];
  // Creation may commit even when its response never reaches the browser. Use
  // only pre-recorded owned agent/name metadata, never recover the plaintext.
  for (let attempt = 0; !ids.length && attempt < 10; attempt++) {
    const response = await call('ListAgentTokens', { agentId: current.agentId }) as { tokens: { id: string; agentId: string; name: string; revokedAt?: string }[] };
    ids = response.tokens.filter(token => token.agentId === current.agentId && token.name === current.tokenName && !token.revokedAt).map(token => token.id);
    if (!ids.length) await new Promise(resolve => setTimeout(resolve, 50));
  }
  for (const tokenId of ids) await call('RevokeAgentToken', { tokenId });
}


interface WorkerEnvironment { TASKER_TOKEN: string; TASKER_BACKEND_URL: string; TASKER_ORG_ID: string; TASKER_PROJECT_ID?: string; }
interface AgentIdentity { id: string; orgId: string; tokenId: string; }
interface McpReply<T> { id?: number; result?: { structuredContent?: T; isError?: boolean; protocolVersion?: string }; }
function parseWorkerJson<T>(text: string): T {
  try { return JSON.parse(text) as T; } catch { throw new Error('External client response was not valid JSON.'); }
}
async function mcp<T>(env: WorkerEnvironment, name: string, args: object): Promise<McpReply<T>> {
  try {
    const response = await fetch(`${env.TASKER_BACKEND_URL}/mcp`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${env.TASKER_TOKEN}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    if (!response.ok) throw new Error(); return parseWorkerJson<McpReply<T>>(await response.text());
  } catch { throw new Error('Owned external MCP request failed.'); }
}
function copiedCliProof(env: WorkerEnvironment, args: string[], agentId: string, tokenId: string, taskId: string) {
  const binary = process.env.TASKER_CONNECTION_CLI_BINARY;
  if (!binary) return; // CI still exercises real HTTP MCP; local proof explicitly supplies the compiled CLI.
  const dir = mkdtempSync(join(tmpdir(), 'tasker-connection-cli-'));
  try {
    const credentialPath = join(dir, 'must-not-exist.json');
    const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, TASKER_CREDENTIALS_PATH: credentialPath }; delete childEnv.TASKER_DEBUG;
    const run = (command: string[], input?: string) => {
      const result = spawnSync(binary, command, { env: childEnv, input, encoding: 'utf8', timeout: 10_000 });
      if (result.status !== 0) throw new Error('Copied configuration did not authenticate the real CLI.'); return result.stdout;
    };
    const identity = parseWorkerJson<{ agent?: AgentIdentity }>(run(['auth', 'whoami', '--json'])).agent;
    expect(Boolean(identity?.id === agentId && identity.tokenId === tokenId && identity.orgId === env.TASKER_ORG_ID)).toBe(true);
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'owned-browser-worker', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_task', arguments: { task_id: taskId } } },
    ];
    const replies = run(args, messages.map(message => JSON.stringify(message)).join('\n') + '\n').trim().split('\n').map(line => parseWorkerJson<McpReply<{ agent?: AgentIdentity; task?: { id: string } }>>(line));
    expect(replies.find(reply => reply.id === 1)?.result?.protocolVersion === '2025-06-18').toBe(true);
    expect(Boolean(replies.find(reply => reply.id === 2)?.result?.structuredContent?.agent?.tokenId === tokenId)).toBe(true);
    expect(Boolean(replies.find(reply => reply.id === 3)?.result?.structuredContent?.task?.id === taskId)).toBe(true);
    expect(existsSync(credentialPath)).toBe(false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('issues least privilege, copies scoped configuration and verifies the exact bearer without cookie fallback', async ({ page, context }) => {
  test.setTimeout(90_000); let tokenId = '', secret = '';
  try {
    await page.goto('/agents'); await expect(page.getByRole('heading', { name: 'AI Agents', level: 1 })).toBeVisible();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    const stamp = Date.now().toString(36), name = `Connection worker ${stamp}`, tokenName = `Browser credential ${stamp}`;
    const { organization } = await adminRpc<{ organization: { id: string } }>(page, 'OrgService', 'SeedOrg', { name: `Connection browser ${stamp}`, slug: `connection-${stamp}` });
    const { template } = await adminRpc<{ template: { id: string } }>(page, 'ProjectTemplateService', 'CreateTemplate', { orgId: organization.id, name: 'First connection template' });
    const { project } = await adminRpc<{ project: { id: string } }>(page, 'ProjectService', 'CreateProject', { orgId: organization.id, templateId: template.id, name: 'First connection project', ownerId: 'dev-user' });
    const { task } = await adminRpc<{ task: { id: string } }>(page, 'TaskService', 'CreateTask', { projectId: project.id, title: 'First worker context', status: 'todo', priority: 4 });
    const { role } = await adminRpc<{ role: { id: string } }>(page, 'AgentService', 'CreateAgentRole', { orgId: organization.id, name: 'Release reader', systemPrompt: 'Read authorized evidence.', capabilities: '[]' });
    await page.goto(`/agents?org=${organization.id}`); await page.getByRole('button', { name: 'Register agent', exact: true }).click();
    await page.getByRole('textbox', { name: 'Agent name', exact: true }).fill(name); await page.getByRole('combobox', { name: 'Role', exact: true }).selectOption(role.id);
    const registration = page.waitForResponse(response => response.url().endsWith('/CreateAgent') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Register', exact: true }).click();
    const { agent } = await (await registration).json() as { agent: { id: string } };
    const connection = page.getByRole('region', { name: `Connect ${name}`, exact: true });
    owned.set(context, { tokenId: '', agentId: agent.id, tokenName, issuanceStarted: false, cookie: (await context.cookies(api)).map(cookie => `${cookie.name}=${cookie.value}`).join('; '), revoked: false });
    await connection.getByRole('button', { name: 'New token', exact: true }).click(); await expect(connection.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await connection.getByLabel('Name', { exact: true }).fill(tokenName); await connection.getByRole('checkbox', { name: 'tasks:read', exact: true }).check(); await connection.getByRole('checkbox', { name: 'comments:write', exact: true }).check();
    const issuance = page.waitForResponse(response => response.url().endsWith('/CreateAgentToken') && response.request().method() === 'POST'); owned.get(context)!.issuanceStarted = true; await connection.getByRole('button', { name: 'Create', exact: true }).click();
    const response = await issuance; expect(response.status()).toBe(200);
    const issued = await response.json() as { token: { id: string; agentId: string; scopes: string[] }; plaintext: string }; tokenId = issued.token.id; secret = issued.plaintext; owned.get(context)!.tokenId = tokenId;
    expect(Boolean(tokenId && secret.startsWith('tskr_'))).toBe(true); expect(JSON.stringify(issued.token.scopes) === JSON.stringify(['tasks:read', 'comments:write'])).toBe(true);
    await expect(connection.getByRole('heading', { name: 'Save this token', exact: true })).toBeFocused();
    const focus = await page.evaluate(() => { const rect = document.activeElement!.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, header: document.querySelector('header')?.getBoundingClientRect().bottom ?? 0, height: innerHeight }; });
    expect(focus.top).toBeGreaterThanOrEqual(focus.header); expect(focus.bottom).toBeLessThanOrEqual(focus.height);
    await connection.getByLabel('Configuration format', { exact: true }).selectOption('mcp');
    const preview = await connection.getByLabel('Worker configuration', { exact: true }).textContent(); expect(Boolean(preview?.includes('<TOKEN>') && !preview.includes(secret))).toBe(true);
    await connection.getByRole('button', { name: 'Copy configuration', exact: true }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    let parsed: unknown; try { parsed = JSON.parse(clipboard); } catch { throw new Error('Copied MCP configuration is not valid JSON.'); }
    const copied = parsed as { mcpServers: { tasker: { command: string; args: string[]; env: WorkerEnvironment } } };
    expect(copied.mcpServers.tasker.env.TASKER_TOKEN === secret).toBe(true); expect(copied.mcpServers.tasker.env.TASKER_BACKEND_URL === api).toBe(true); expect(copied.mcpServers.tasker.env.TASKER_ORG_ID === organization.id).toBe(true);
    const worker = copied.mcpServers.tasker;
    expect(worker.command === 'tasker' && JSON.stringify(worker.args) === '["mcp"]').toBe(true);
    const who = await mcp<{ agent?: AgentIdentity }>(worker.env, 'whoami', {});
    expect(Boolean(who.result?.structuredContent?.agent?.tokenId === tokenId)).toBe(true);
    const read = await mcp<{ task?: { id: string } }>(worker.env, 'get_task', { task_id: task.id });
    expect(Boolean(read.result?.structuredContent?.task?.id === task.id)).toBe(true);
    const noteText = `First external worker note ${stamp}`;
    const note = await mcp<{ taskNote?: { agentId: string; content: string } }>(worker.env, 'add_task_note', { task_id: task.id, content: noteText });
    expect(Boolean(note.result?.structuredContent?.taskNote?.agentId === issued.token.agentId && note.result.structuredContent.taskNote.content === noteText)).toBe(true);
    const denied = await mcp<object>(worker.env, 'create_task', { project_id: project.id, title: 'Must be refused without tasks:write' });
    expect(denied.result?.isError).toBe(true);
    copiedCliProof(worker.env, worker.args, issued.token.agentId, tokenId, task.id);
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
    await expect(connection.getByRole('button', { name: 'New token', exact: true })).toBeFocused();
    let status = 0;
    try { status = (await fetch(`${api}/tasker.health.v1.AuthService/GetIdentity`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', authorization: `Bearer ${secret}` }, body: '{}' })).status; }
    catch { throw new Error('Owned revoked-credential check could not reach the API.'); } expect(status).toBe(401);
  } finally { secret = ''; }
});
