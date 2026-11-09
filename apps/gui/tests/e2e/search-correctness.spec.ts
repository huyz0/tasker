import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { selectSeededOrg } from './selectSeededOrg';

test.beforeEach(async ({ context }) => {
  const backend = process.env.TASKER_E2E_BACKEND_URL;
  if (backend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, backend).href });
    await route.fulfill({ response, body: await response.body() });
  });
});
test.afterEach(async ({ context }) => context.unrouteAll({ behavior: 'ignoreErrors' }));

async function rpc<T>(page: Page, service: string, method: string, data: object): Promise<T> {
  const response = await page.request.post(`${process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080'}/tasker.health.v1.${service}/${method}`, { data });
  expect(response.ok(), `${service}/${method}: ${response.status()}`).toBe(true);
  return response.json();
}

async function currentProject(page: Page) {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  const url = new URL(page.url());
  return { orgId: url.searchParams.get('org')!, projectId: url.searchParams.get('project')! };
}

async function allTypes(page: Page, orgId: string) {
  const probe = `Searchprobe${Date.now()}`;
  const { template } = await rpc<{ template: { id: string } }>(page, 'ProjectTemplateService', 'CreateTemplate', { orgId, name: probe, description: '' });
  const { project } = await rpc<{ project: { id: string; name: string } }>(page, 'ProjectService', 'CreateProject', { orgId, templateId: template.id, name: `${probe} project`, ownerId: 'dev-user' });
  const { task } = await rpc<{ task: { id: string } }>(page, 'TaskService', 'CreateTask', { projectId: project.id, title: `${probe} task`, status: 'todo', description: 'Review the evidence.' });
  const { folder } = await rpc<{ folder: { id: string } }>(page, 'ArtifactService', 'CreateFolder', { projectId: project.id, parentId: '', name: probe });
  const { artifact } = await rpc<{ artifact: { id: string } }>(page, 'ArtifactService', 'CreateArtifact', { folderId: folder.id, name: `${probe} artifact`, content: 'Verification evidence.', contentType: 'text/markdown', description: '' });
  const { role } = await rpc<{ role: { id: string } }>(page, 'AgentService', 'CreateAgentRole', { orgId, name: probe, systemPrompt: 'Review authorized work.', capabilities: '[]' });
  await rpc(page, 'AgentService', 'CreateAgent', { orgId, agentRoleId: role.id, name: `${probe} agent` });
  for (const [entityType, entityId] of [['task', task.id], ['artifact', artifact.id]]) {
    await rpc(page, 'CommentService', 'CreateComment', { entityType, entityId, content: `${probe} discussion` });
  }
  const statement = `${probe} convention`;
  const { belief } = await rpc<{ belief: { id: string } }>(page, 'MemoryService', 'RecordBelief', { orgId, scopeType: 'project', scopeId: project.id, statement, confidence: 'high' });
  return { probe, project, belief, statement };
}

test('all six groups share visible keyboard order, scroll and Memory ownership', async ({ page }, info) => {
  const { orgId, projectId: projectA } = await currentProject(page);
  const fixture = await allTypes(page, orgId);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const origin = page.url();
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search workspace' });
  await input.fill(fixture.probe);
  const options = page.getByRole('option');
  await expect(options).toHaveCount(7);
  expect((await page.getByRole('dialog').boundingBox())!.height).toBeLessThanOrEqual(350);
  for (const group of ['Tasks · 1', 'Artifacts · 1', 'Projects · 1', 'Agents · 1', 'Comments · 2', 'Memory · 1']) {
    await expect(page.getByRole('group', { name: group, exact: true })).toBeVisible();
  }
  for (const [group, path, project] of [
    ['Projects · 1', '/projects', fixture.project.id], ['Agents · 1', '/agents', projectA],
  ]) {
    await page.getByRole('group', { name: group, exact: true }).getByRole('option').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(path);
    expect(new URL(page.url()).searchParams.get('org')).toBe(orgId);
    expect(new URL(page.url()).searchParams.get('project')).toBe(project);
    await page.goBack();
    await expect(page).toHaveURL(origin);
    await page.keyboard.press('Control+k');
    await expect(options).toHaveCount(7);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close search' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Close search' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  for (let i = 0; i < 7; i++) {
    await expect(input).toBeFocused();
    await expect(options.nth(i)).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(i).getAttribute('id'))!);
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowUp');
  const memory = page.getByRole('option', { name: fixture.statement, exact: true });
  await expect(memory).toHaveAttribute('aria-selected', 'true');
  await expect(memory).toBeInViewport({ ratio: 1 });
  await expect(input).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('all-search-types.png'), animations: 'disabled' });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Belief detail' })).toContainText(fixture.statement);
  expect(new URL(page.url()).searchParams.get('project')).toBe(fixture.project.id);
  expect(new URL(page.url()).searchParams.get('scope')).toBe('project');
  await page.goBack();
  await expect(page).toHaveURL(origin);
});

test('failed search is readable on dark mobile and keyboard Retry returns to the input', async ({ page }, info) => {
  const { projectId } = await currentProject(page);
  const title = `Searchretry${Date.now()}`;
  await rpc(page, 'TaskService', 'CreateTask', { projectId, title, status: 'todo', description: 'Retry evidence.' });
  let failing = true;
  await page.route('**/tasker.health.v1.SearchService/UniversalSearch', route => failing
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Search temporarily offline' }) })
    : route.fallback());
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search workspace' });
  await input.fill(title);
  await expect(page.getByRole('alert')).toContainText('Search temporarily offline');
  await expect(page.getByRole('option')).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('[role="dialog"]')!, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  })).violations.map(violation => violation.id));
  expect(violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('search-error-mobile-dark.png'), animations: 'disabled' });
  await expect(input).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close search' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  failing = false;
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await expect(page.getByRole('option', { name: new RegExp(title) })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
});

test('typing hides stale suggestions before debounce and subsequent failure cannot capture Enter', async ({ page }) => {
  const { projectId } = await currentProject(page);
  const oldTitle = `Searchold${Date.now()}`, newTitle = `Searchnew${Date.now()}`;
  for (const title of [oldTitle, newTitle]) await rpc(page, 'TaskService', 'CreateTask', { projectId, title, status: 'todo', description: '' });
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search workspace' });
  await input.fill(oldTitle);
  await expect(page.getByRole('option', { name: oldTitle, exact: true })).toBeVisible();
  let failing = true;
  await page.route('**/tasker.health.v1.SearchService/UniversalSearch', async route => {
    if (route.request().postDataJSON().query === newTitle && failing) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Current query failed' }) });
    } else await route.fallback();
  });
  const origin = page.url();
  await input.fill(newTitle);
  const immediate = await input.evaluate(element => ({ text: (element as HTMLInputElement).value,
    options: document.querySelectorAll('#global-search-listbox [role="option"]').length,
    status: document.querySelector('[role="dialog"] [role="status"]')?.textContent }));
  expect(immediate.text).toBe(newTitle);
  expect(immediate.options).toBe(0);
  expect(immediate.status).toContain('Searching');
  await input.press('Enter');
  await expect(page).toHaveURL(origin);
  await expect(page.getByRole('alert')).toContainText('Current query failed');
  await input.press('Enter');
  await expect(page).toHaveURL(origin);
  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(input).toBeFocused();
  await expect(page.getByRole('option', { name: newTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: oldTitle, exact: true })).toHaveCount(0);
});
