import { test, expect, type Page } from '@playwright/test';

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
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body),
    });
    const result = await response.json(); if (!response.ok) throw new Error(`${method}: ${response.status}`); return result;
  }, { service, method, body });
}

/** Own resources through current authenticated RPCs; no preexisting source rows. */
async function fixture(page: Page, count: number) {
  await page.goto('/attention'); await expect(page.getByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
  const identity = await rpc<{ user: { id: string } }>(page, 'AuthService', 'GetIdentity', {});
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const { organization } = await rpc<{ organization: { id: string } }>(page, 'OrgService', 'SeedOrg', { name: `Attention browser ${stamp}`, slug: `attention-${stamp}` });
  const { template } = await rpc<{ template: { id: string } }>(page, 'ProjectTemplateService', 'CreateTemplate', { orgId: organization.id, name: 'Attention browser template' });
  const projects: { id: string; name: string }[] = [];
  for (const name of ['Attention Alpha', 'Attention Beta']) {
    const { project } = await rpc<{ project: { id: string; name: string } }>(page, 'ProjectService', 'CreateProject', { orgId: organization.id, templateId: template.id, ownerId: identity.user.id, name });
    projects.push(project);
  }
  const tasks: { id: string }[] = [];
  for (const project of projects) {
    const { task } = await rpc<{ task: { id: string } }>(page, 'TaskService', 'CreateTask', { projectId: project.id, title: `Inspect ${project.name}`, status: 'todo' }); tasks.push(task);
  }
  for (let i = 0; i < count; i++) await rpc(page, 'TaskService', 'RequestInput', { taskId: tasks[i % 2]!.id, question: `Question ${String(i + 1).padStart(3, '0')}: which release target?`, options: [] });
  return { orgId: organization.id, projects, tasks };
}

test('real Attention paging, All projects and keyboard task/Back flow preserve source extent and both-theme mobile layout', async ({ page }, info) => {
  const f = await fixture(page, 51);
  await page.goto(`/attention?${new URLSearchParams({ org: f.orgId, project: f.projects[0]!.id, kind: 'question' })}`);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('option', { name: 'All projects', exact: true }).click();
  const section = page.getByRole('region', { name: 'Questions', exact: true });
  await expect(section.getByText('20 loaded of 51', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Load more questions' }).click(); await expect(section.getByText('40 loaded of 51')).toBeVisible();
  await section.getByRole('button', { name: 'Load more questions' }).click(); await expect(section.getByText('51 loaded of 51')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Active project', exact: true })).toHaveText('All projects');
  expect(new URL(page.url()).searchParams.has('project')).toBe(false);
  const target = section.locator(`a[href*="project=${f.projects[1]!.id}"]`).last();
  const anchor = await target.getAttribute('id'); expect(anchor).toBeTruthy();
  await target.scrollIntoViewIfNeeded(); await target.focus(); const top = await page.evaluate(() => window.scrollY);
  await target.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page).toHaveURL(new RegExp(`project=${f.projects[1]!.id}`));
  await expect(page.getByRole('button', { name: 'Active project', exact: true, includeHidden: true })).toHaveText('Attention Beta');
  await page.goBack(); await expect(section.getByText('51 loaded of 51')).toBeVisible();
  await expect(page.locator(`[id="${anchor}"]`)).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(Math.max(0, top - 150));
  await expect(page.getByRole('button', { name: 'Active project', exact: true })).toHaveText('All projects');
  expect(new URL(page.url()).searchParams.has('project')).toBe(false);
  await page.reload(); await expect(section.getByText('20 loaded of 51')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Active project', exact: true })).toHaveText('All projects');
  for (const theme of ['light', 'dark']) for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => { document.documentElement.setAttribute('data-theme', value); window.scrollTo(0, 0); }, theme);
    const sidebar = page.locator('#app-sidebar');
    if (width < 768) {
      await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
      await expect(page.getByLabel('Current project', { exact: true })).toHaveText('All projects');
    } else await expect.poll(() => sidebar.evaluate(element => element.getBoundingClientRect().left)).toBe(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('navigation', { name: 'Attention sources' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`attention-${theme}-${width}.png`) });
  }
});

test('real Attention hides all source metadata through denial, offline retry and per-group recovery', async ({ page }, info) => {
  const f = await fixture(page, 2); await page.goto(`/attention?org=${f.orgId}`);
  const section = page.getByRole('region', { name: 'Questions', exact: true }); await expect(section.getByText('2 loaded of 2')).toBeVisible();
  const path = 'http://localhost:8080/tasker.health.v1.AttentionService/ListAttention';
  await page.route(path, route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'permission_denied', message: 'Current task access removed' }) }));
  await section.getByRole('button', { name: 'Refresh questions' }).click(); await expect(section.getByRole('alert')).toContainText('access removed');
  await expect(section.getByRole('link')).toHaveCount(0); await expect(page.getByText('Unavailable', { exact: true })).toHaveCount(4);
  await page.unroute(path);
  await page.route(path, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Offline retry' }) }));
  await section.getByRole('button', { name: 'Try again' }).click(); await expect(section.getByRole('alert')).toContainText('Offline retry');
  await expect(section.getByRole('link')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('attention-denied-offline.png') });
  await page.unroute(path); await page.getByRole('navigation', { name: 'Attention sources' }).getByRole('link', { name: /Approvals/ }).click();
  const approvals = page.getByRole('region', { name: 'Approvals', exact: true });
  await expect(approvals.getByRole('alert')).toBeVisible(); await approvals.getByRole('button', { name: 'Try again' }).click();
  await expect(approvals.getByText('No pending move approvals in this scope.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Attention sources' }).getByRole('link', { name: /Questions/ }).click();
  await expect(section.getByRole('link')).toHaveCount(0); await section.getByRole('button', { name: 'Try again' }).click();
  await expect(section.getByText('2 loaded of 2')).toBeVisible();
});
