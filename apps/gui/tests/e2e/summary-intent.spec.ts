import { test, expect, type Page } from '@playwright/test';
import axe from 'axe-core';
import { selectSeededOrg } from './selectSeededOrg';

test.setTimeout(90_000);
test.beforeEach(async ({ context }) => {
  const backend = process.env.TASKER_E2E_BACKEND_URL;
  if (backend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, backend).href });
    await route.fulfill({ response, body: await response.body() });
  });
});
test.afterEach(async ({ context }) => context.unrouteAll({ behavior: 'ignoreErrors' }));

async function rpc(page: Page, service: string, method: string, data: object): Promise<any> {
  const response = await page.request.post(`${process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080'}/tasker.health.v1.${service}/${method}`, { data });
  expect(response.ok(), `${service}/${method}: ${response.status()}`).toBe(true);
  return response.json();
}
async function fixture(page: Page) {
  await selectSeededOrg(page);
  const name = `Summary ${Date.now()}`;
  const { organization } = await rpc(page, 'OrgService', 'SeedOrg', { name, slug: `summary-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  const { template } = await rpc(page, 'ProjectTemplateService', 'CreateTemplate', { orgId: organization.id, name, description: '' });
  const { project } = await rpc(page, 'ProjectService', 'CreateProject', { orgId: organization.id, templateId: template.id, name, ownerId: 'dev-user' });
  const tasks = [];
  for (const title of ['Summary task A', 'Summary task B']) tasks.push((await rpc(page, 'TaskService', 'CreateTask', { projectId: project.id, title, status: 'todo', description: '' })).task);
  await page.goto(`/tasks?org=${organization.id}&project=${project.id}`);
  await expect(page.getByText(tasks[0].title, { exact: true })).toBeVisible();
  return { orgId: organization.id, project, templateId: template.id, a: tasks[0], b: tasks[1] };
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Task Details', exact: true });
async function open(page: Page, title: string) {
  await page.getByText(title, { exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  const heading = dialog(page).getByRole('heading', { name: 'Summary', exact: true });
  if (await heading.locator('xpath=ancestor::details[1]').getAttribute('open') === null) await heading.click();
}
async function write(page: Page, text: string) {
  const summary = dialog(page).getByLabel('Summary', { exact: true });
  if (!await summary.count()) await dialog(page).getByRole('button', { name: 'Write a summary', exact: true }).click();
  await summary.fill(text);
}
async function close(page: Page) {
  await dialog(page).getByRole('button', { name: 'Close task details', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
}

test('all supported task dismissals and SPA navigation restore the original task draft', async ({ page }) => {
  const f = await fixture(page);
  for (const exit of ['Escape', 'backdrop', 'close', 'breadcrumb', 'Back']) {
    await open(page, f.a.title);
    const text = `Retained through ${exit}`;
    await write(page, text);
    if (exit === 'Escape') await page.keyboard.press('Escape');
    else if (exit === 'backdrop') await page.getByTestId('dialog-backdrop').click({ position: { x: 5, y: 5 } });
    else if (exit === 'breadcrumb') await dialog(page).getByRole('link', { name: 'Tasks', exact: true }).click();
    else if (exit === 'Back') await page.goBack();
    else await close(page);
    await expect(dialog(page)).toHaveCount(0);
    if (exit === 'Back') {
      await page.goForward();
      await expect(dialog(page)).toBeVisible();
    } else await open(page, f.a.title);
    await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue(text);
    await expect(dialog(page).getByText('Unsaved draft', { exact: true })).toBeVisible();
    await close(page);
  }
  // The modal correctly blocks background navigation; close it before using
  // the sidebar or scope selectors, then verify the same retained intent.
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await open(page, f.b.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveCount(0);
  await write(page, 'Only task B');
  await close(page);
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Retained through Back');
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await close(page);
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveCount(0);
  await close(page);
  await open(page, f.b.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Only task B');
});

test('project and organization switches retain a task draft without moving it to another task', async ({ page }) => {
  const f = await fixture(page);
  const { project: other } = await rpc(page, 'ProjectService', 'CreateProject', { orgId: f.orgId, templateId: f.templateId, name: 'Other summary project', ownerId: 'dev-user' });
  const { organization: otherOrg } = await rpc(page, 'OrgService', 'SeedOrg', { name: `Other summary organization ${Date.now()}`, slug: `other-summary-${Date.now()}` });
  await open(page, f.a.title); await write(page, 'Retained across scope'); await close(page);
  const selectProject = async (name: string) => {
    await page.getByRole('button', { name: 'Active project', exact: true }).click();
    await page.getByRole('combobox', { name: 'Search active project' }).fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await selectProject(other.name);
  await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(other.id);
  await selectProject(f.project.name);
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Retained across scope');
  await close(page);
  const selectOrg = async (name: string) => {
    await page.getByRole('button', { name: 'Active organization', exact: true }).click();
    await page.getByRole('combobox', { name: 'Search active organization' }).fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await selectOrg(otherOrg.name);
  await expect.poll(() => new URL(page.url()).searchParams.get('org')).toBe(otherOrg.id);
  await selectOrg(f.project.name);
  await selectProject(f.project.name);
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Retained across scope');
});

test('older save responses preserve newer writing, failures restore, and explicit Clear reaches the server', async ({ page }, info) => {
  const f = await fixture(page);
  let release!: () => void, held = false, calls = 0, fail = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/tasker.health.v1.TaskService/SetTaskSummary', async route => {
    calls++;
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Summary temporarily offline' }) });
    if (calls === 1) {
      const backend = process.env.TASKER_E2E_BACKEND_URL;
      const requested = new URL(route.request().url());
      const response = await route.fetch(backend ? { url: new URL(requested.pathname + requested.search, backend).href } : {}); held = true; await gate;
      return route.fulfill({ response, body: await response.body() });
    }
    return route.fallback();
  });
  await open(page, f.a.title); await write(page, 'Submitted version');
  await dialog(page).getByRole('button', { name: 'Save summary', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await write(page, 'Newer writing');
  await close(page); await open(page, f.b.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveCount(0);
  await close(page); await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Newer writing');
  await expect(dialog(page).getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  release();
  await expect(dialog(page).getByRole('button', { name: 'Save summary', exact: true })).toBeEnabled();
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Newer writing');
  await dialog(page).getByRole('button', { name: 'Save summary', exact: true }).click();
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveCount(0);
  expect((await rpc(page, 'TaskService', 'GetTask', { taskId: f.a.id })).task.summary.text).toBe('Newer writing');
  await dialog(page).getByRole('button', { name: 'Edit', exact: true }).last().click();
  await write(page, 'Keep after failed save'); fail = true;
  await dialog(page).getByRole('button', { name: 'Save summary', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Summary temporarily offline');
  await close(page); await open(page, f.a.title);
  await expect(dialog(page).getByRole('alert')).toContainText('Summary temporarily offline');
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Keep after failed save');
  await page.setViewportSize({ width: 375, height: 850 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await dialog(page).getByRole('alert').scrollIntoViewIfNeeded();
  await page.evaluate(axe.source);
  const audit = await page.evaluate(async () => (window as any).axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('summary-draft-error-mobile-dark.png'), animations: 'disabled' });
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click(); fail = false;
  await dialog(page).getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(async () => (await rpc(page, 'TaskService', 'GetTask', { taskId: f.a.id })).task.summary ?? null).toBeNull();
});

test('native reload warns with the task closed, stay retains intent and leave discards session memory', async ({ page }) => {
  const f = await fixture(page);
  await open(page, f.a.title); await write(page, 'Native exit intent'); await close(page);
  // Playwright's reload navigation waiter does not finish when a browser
  // cancels reload. Send the same Chromium reload command and await the
  // actual prompt/command, then inspect the still-live document directly.
  const cdp = await page.context().newCDPSession(page);
  const prompt = page.waitForEvent('dialog');
  const reload = cdp.send('Page.reload');
  const staying = await prompt;
  expect(staying.type()).toBe('beforeunload');
  await staying.dismiss();
  await reload;
  await cdp.detach();
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveValue('Native exit intent');
  await close(page);
  let left = false;
  page.once('dialog', async prompt => { expect(prompt.type()).toBe('beforeunload'); left = true; await prompt.accept(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(left).toBe(true);
  await open(page, f.a.title);
  await expect(dialog(page).getByLabel('Summary', { exact: true })).toHaveCount(0);
});
