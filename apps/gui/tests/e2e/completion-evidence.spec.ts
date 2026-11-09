import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

const backend = process.env.TASKER_E2E_BACKEND_URL;
test.beforeEach(async ({ context }) => {
  if (backend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, backend).href });
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ context }) => context.unrouteAll({ behavior: 'ignoreErrors' }));

async function rpc<T>(page: Page, service: string, method: string, body: object): Promise<T> {
  return page.evaluate(async ({ service, method, body }) => {
    const response = await fetch(`http://localhost:8080/tasker.health.v1.${service}/${method}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method}: ${response.status}`);
    return result;
  }, { service, method, body });
}
async function openWork(page: Page) {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  const scope = new URL(page.url());
  const projectId = scope.searchParams.get('project')!;
  const created = await rpc<{ task: { id: string } }>(page, 'TaskService', 'CreateTask', { projectId, title: 'Review evidence output', status: 'todo' });
  await page.goto(`/tasks/${created.task.id}${scope.search}`);
  await expect(page.getByRole('dialog')).toBeVisible();
  return { taskId: created.task.id, projectId };
}

test('real bounded evidence preserves summary writing, canonical artifact navigation and both-theme mobile layout', async ({ page }, testInfo) => {
  const { taskId, projectId } = await openWork(page);
  const folders = await rpc<{ folders: { id: string }[] }>(page, 'ArtifactService', 'ListFolders', { projectId, page: { limit: 1 } });
  const artifacts = await rpc<{ artifacts: { id: string; name: string }[] }>(page, 'ArtifactService', 'ListArtifacts', { folderId: folders.folders[0].id, page: { limit: 21 } });
  expect(artifacts.artifacts).toHaveLength(21);
  for (const artifact of artifacts.artifacts) await rpc(page, 'ArtifactService', 'LinkTaskArtifact', { taskId, artifactId: artifact.id });
  const section = page.getByRole('region', { name: 'Evidence', exact: true });
  let bodyReads = 0;
  page.on('request', request => { if (/ArtifactService\/(GetArtifactContent|GetArtifact)$/.test(request.url())) bodyReads++; });
  await section.getByRole('button', { name: 'Refresh evidence' }).click();
  await expect(section.getByText('20 loaded of 21', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Load more evidence' }).click();
  await expect(section.getByText('21 loaded of 21', { exact: true })).toBeVisible();
  const summary = page.getByRole('dialog').locator('details').filter({ has: page.getByRole('heading', { name: 'Summary', exact: true }) });
  if (!(await summary.getAttribute('open'))) await summary.locator('summary').click();
  await page.getByRole('button', { name: 'Write a summary', exact: true }).click();
  const draft = `Human review draft ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Summary', exact: true }).fill(draft);
  await section.getByRole('button', { name: 'Refresh evidence' }).click();
  await expect(section.getByText('21 loaded of 21', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
  expect(bodyReads).toBe(0);
  for (const theme of ['light', 'dark']) for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await section.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`evidence-${theme}-${width}.png`) });
  }
  const source = section.getByRole('link').first();
  expect(await source.getAttribute('href')).not.toContain('project=');
  await source.focus();
  await source.press('Enter');
  await expect(page).toHaveURL(/\/artifacts\//);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
});

test('an evidence access failure hides accepted rows through a later offline retry', async ({ page }, testInfo) => {
  const { taskId, projectId } = await openWork(page);
  const folders = await rpc<{ folders: { id: string }[] }>(page, 'ArtifactService', 'ListFolders', { projectId, page: { limit: 1 } });
  const artifacts = await rpc<{ artifacts: { id: string }[] }>(page, 'ArtifactService', 'ListArtifacts', { folderId: folders.folders[0].id, page: { limit: 1 } });
  await rpc(page, 'ArtifactService', 'LinkTaskArtifact', { taskId, artifactId: artifacts.artifacts[0].id });
  const section = page.getByRole('region', { name: 'Evidence', exact: true });
  await section.getByRole('button', { name: 'Refresh evidence' }).click();
  await expect(section.getByRole('link')).toHaveCount(1);
  await expect(section.getByText(/loaded/)).toBeVisible();
  const path = 'http://localhost:8080/tasker.health.v1.ArtifactService/ListTaskArtifactLinks';
  await page.route(path, route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'permission_denied', message: 'Evidence access removed' }) }));
  await section.getByRole('button', { name: 'Refresh evidence' }).click();
  await expect(section.getByRole('alert')).toContainText('Evidence access removed');
  await expect(section.getByRole('link')).toHaveCount(0);
  await page.unroute(path);
  await page.route(path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Evidence offline' }) }));
  await section.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Evidence offline');
  await expect(section.getByRole('link')).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Link an artifact…' })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`evidence-offline-${theme}-375.png`) });
  }
  await page.unroute(path);
  await section.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(section.getByText(/loaded/)).toBeVisible();
});

test('a real MCP worker output appears on the open human review surface without losing writing', async ({ page }) => {
  test.setTimeout(45_000); // Includes the documented 15-second visible metadata poll.
  const { taskId, projectId } = await openWork(page);
  const section = page.getByRole('region', { name: 'Evidence', exact: true });
  await expect(section.getByText('No evidence linked', { exact: true })).toBeVisible();
  const scope = new URL(page.url());
  const summary = page.getByRole('dialog').locator('details').filter({ has: page.getByRole('heading', { name: 'Summary', exact: true }) });
  await summary.locator('summary').click();
  await page.getByRole('button', { name: 'Write a summary', exact: true }).click();
  const draft = 'Human review writing remains while the worker attaches output.';
  await page.getByRole('textbox', { name: 'Summary', exact: true }).fill(draft);
  let browserBodyReads = 0;
  page.on('request', request => { if (/ArtifactService\/GetArtifactContent$/.test(request.url())) browserBodyReads++; });

  // Native fetch stays outside Playwright tracing; never pass the minted secret
  // through page.evaluate, APIRequestContext, attachments, logs or assertions.
  const base = backend || 'http://localhost:8080';
  const login = await fetch(`${base}/api/auth/test/inject?userId=dev-user`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  expect(!!cookie).toBe(true);
  async function nativeRpc<T>(service: string, method: string, body: object): Promise<T> {
    const response = await fetch(`${base}/tasker.health.v1.${service}/${method}`, { method: 'POST',
      headers: { cookie: cookie!, 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body) });
    expect(response.ok).toBe(true); return response.json();
  }
  const agents = await nativeRpc<{ agents: { id: string; name: string }[] }>('AgentService', 'ListAgents', { orgId: scope.searchParams.get('org'), page: { limit: 1 } });
  const issued = await nativeRpc<{ token: { id: string }; plaintext: string }>('AgentService', 'CreateAgentToken', {
    agentId: agents.agents[0].id, name: 'Owned human-handoff browser proof', expiresInDays: 1, scopes: ['tasks:read', 'artifacts:read', 'artifacts:write'],
  });
  try {
    let id = 0;
    async function worker<T>(name: string, args: object): Promise<T> {
      const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${issued.plaintext}`,
        'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) });
      expect(response.ok).toBe(true);
      const body = await response.json() as { error?: object; result: { isError?: boolean; structuredContent: T } };
      expect(body.error).toBeUndefined(); expect(body.result.isError).toBeUndefined(); return body.result.structuredContent;
    }
    const folders = await worker<{ folders: { id: string }[] }>('list_folders', { project_id: projectId });
    const name = `worker-verification-${Date.now()}.txt`, content = '\uFEFFWorker output 😀\0'.repeat(400);
    const output = await worker<{ artifact: { id: string } }>('create_artifact', { folder_id: folders.folders[0].id, name, content, content_type: 'text/plain' });
    await worker('link_task_artifact', { task_id: taskId, artifact_id: output.artifact.id });
    const source = section.getByRole('link', { name, exact: true });
    await expect(source).toBeVisible({ timeout: 20_000 }); // No refresh click or client invalidation.
    await expect(section.getByText(`Linked by Agent ${agents.agents[0].name}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
    expect(browserBodyReads).toBe(0);
    const read = await worker<{ content: string; truncated?: boolean }>('get_artifact_content', { artifact_id: output.artifact.id });
    expect(read.content).toBe(Array.from(content).slice(0, 4000).join('')); expect(read.truncated).toBe(true);
    await source.focus(); await source.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/artifacts/${output.artifact.id}`));
    await page.goBack();
    await expect(page.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  } finally {
    const revoked = await nativeRpc<{ success: boolean }>('AgentService', 'RevokeAgentToken', { tokenId: issued.token.id });
    expect(revoked.success).toBe(true);
  }
});
