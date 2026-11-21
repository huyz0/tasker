import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createClient, Code, ConnectError } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { AuthService, OrgService, ProjectService, ProjectTemplateService, SavedViewService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb.ts';

const api = process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080';
// Real credentials stay in memory, outside browser recordings and failure artifacts.
test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 375, height: 1000 } });

async function principal(context: BrowserContext, username = 'view-browser-' + crypto.randomUUID()) {
  const response = await context.request.post(api + '/api/auth/password/register', {
    data: { username, password: crypto.randomUUID() + 'Browser!9' },
  });
  if (response.status() !== 201) throw new Error('Owned browser identity registration failed.');
  const cookie = (await context.cookies(api)).map(value => value.name + '=' + value.value).join('; ');
  if (!cookie) throw new Error('Owned browser session was not issued.');
  const transport = createConnectTransport({ baseUrl: api, defaultTimeoutMs: 15_000, interceptors: [next => async request => {
    request.header.set('cookie', cookie);return next(request);
  }] });
  const userId = (await createClient(AuthService, transport).getIdentity({})).user?.id;
  if (!userId) throw new Error('Owned browser identity was not confirmed.');
  return { userId, views: createClient(SavedViewService, transport), orgs: createClient(OrgService, transport),
    projects: createClient(ProjectService, transport), templates: createClient(ProjectTemplateService, transport) };
}
type Actor = Awaited<ReturnType<typeof principal>>;
type Owned = { id: string; owner: Actor };
async function workspace(admin: Actor) {
  const org = (await admin.orgs.seedOrg({ name: 'Saved views browser proof', slug: 'views-browser-' + crypto.randomUUID() })).organization!;
  const template = (await admin.templates.createTemplate({ orgId: org.id, name: 'Views browser template' })).template!;
  const create = async (name: string) => (await admin.projects.createProject({ orgId: org.id,
    templateId: template.id, ownerId: admin.userId, name })).project!;
  return { orgId: org.id, first: await create('Release planning'), second: await create('Operations followup') };
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Saved views', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved views', exact: true });
  await expect(dialog.getByRole('searchbox', { name: 'Filter Personal views by name' })).toBeVisible();
  return dialog;
}
async function close(page: Page) {
  await page.getByRole('button', { name: 'Close saved views' }).click();
  await expect(page.getByRole('dialog', { name: 'Saved views', exact: true })).toHaveCount(0);
}
async function cleanup(owned: Owned[]) {
  const results = await Promise.allSettled(owned.map(async entry => {
    try { await entry.owner.views.deleteSavedView({ viewId: entry.id }); }
    catch (error) { if (ConnectError.from(error).code !== Code.NotFound) throw error; }
  }));
  if (results.some(result => result.status === 'rejected')) throw new Error('Owned saved-view cleanup failed.');
}

test('saved views preserve intentional history, privacy and current shared access through real browser recovery', async ({ page, context, browser, baseURL }) => {
  test.setTimeout(150_000);
  const memberContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 } });
  const foreignContext = await browser.newContext({ baseURL });
  const owned: Owned[] = [];
  let admin: Actor | undefined, member: Actor | undefined, orgId = '', secondId = '', archived = false;
  try {
    admin = await principal(context);
    const foreign = await principal(foreignContext), space = await workspace(admin);
    orgId = space.orgId;secondId = space.second.id;
    const username = 'view-member-' + crypto.randomUUID();
    await admin.orgs.inviteUser({ orgId, username, role: 'member' });
    member = await principal(memberContext, username);
    const create = async (name: string, visibility = 'personal', actor = admin!, projectId = space.first.id) => {
      const view = (await actor.views.createSavedView({ projectId, name, visibility,
        definition: { version: 1, screen: 'tasks', tasks: { viewMode: 'table', search: name, priority: 0, ready: false } } })).view!;
      owned.push({ id: view.id, owner: visibility === 'organization' ? admin! : actor });return view;
    };
    const privateA = await create('Owner private', 'personal', admin, secondId);
    const privateB = await create('Member private', 'personal', member);
    const shared = await create('Shared release query', 'organization');
    await expect(member.views.getSavedView({ viewId: privateA.id })).rejects.toMatchObject({ code: Code.NotFound });
    await expect(admin.views.getSavedView({ viewId: privateB.id })).rejects.toMatchObject({ code: Code.NotFound });
    await expect(foreign.views.getSavedView({ viewId: shared.id })).rejects.toMatchObject({ code: Code.NotFound });
    await expect(member.views.renameSavedView({ viewId: shared.id, name: 'Denied' })).rejects.toMatchObject({ code: Code.PermissionDenied });
    const taskPath = '/tasks?org=' + orgId + '&project=' + space.first.id + '&view=table&q=before';
    await page.goto(taskPath);
    let dialog = await open(page);
    await dialog.getByRole('button', { name: 'Open Owner private', exact: true }).click();
    const input = page.getByRole('searchbox', { name: 'Filter tasks', exact: true });
    await expect(input).toHaveValue('Owner private');
    await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(secondId);
    await expect(page.getByRole('combobox', { name: 'Filter by priority' })).toHaveValue('0');
    await page.reload();await expect(input).toHaveValue('Owner private');
    await page.goBack();await expect(input).toHaveValue('before');
    await page.goForward();await expect(input).toHaveValue('Owner private');
    await open(page);await close(page);
    await expect(page.getByRole('button', { name: 'Saved views', exact: true })).toBeFocused();

    // The response is real and authorized; a newer native history choice must win.
    await page.goto(taskPath);
    await page.getByRole('combobox', { name: 'Filter by priority' }).selectOption('2');
    await expect.poll(() => new URL(page.url()).searchParams.get('priority')).toBe('2');
    let release!: () => void, held = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/tasker.health.v1.SavedViewService/GetSavedView', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch();expect(response.status()).toBe(200);held = true;
      await gate;await route.fulfill({ response });
    });
    try {
      dialog = await open(page);await dialog.getByRole('button', { name: 'Open Owner private', exact: true }).click();
      await expect.poll(() => held).toBe(true);await page.goBack();
      await expect.poll(() => new URL(page.url()).searchParams.has('priority')).toBe(false);
      const intended = page.url();release();
      await expect(dialog.getByRole('alert'), 'late authorized Open must refuse newer browser intent').toContainText('Your current view changed');
      expect(page.url()).toBe(intended);await close(page);
    } finally { release();await page.unroute('**/tasker.health.v1.SavedViewService/GetSavedView'); }

    const memberPage = await memberContext.newPage();await memberPage.goto(taskPath);
    dialog = await open(memberPage);
    await expect(dialog.getByText('Owner private', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Member private', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Rename Shared release query', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Open Shared release query', exact: true }).click();
    await expect(memberPage.getByRole('searchbox', { name: 'Filter tasks', exact: true })).toHaveValue('Shared release query');
    await admin.orgs.updateOrgMemberRole({ orgId, userId: member.userId, role: 'admin' });
    const formerAdmin = await create('Member shared perspective', 'organization', member);
    dialog = await open(memberPage);
    await dialog.getByRole('button', { name: 'Rename Member shared perspective', exact: true }).click();
    await dialog.getByLabel('View name').fill('Retained rename draft');
    await admin.orgs.updateOrgMemberRole({ orgId, userId: member.userId, role: 'member' });
    await dialog.getByRole('searchbox', { name: 'Filter Organization views by name' }).fill('Member shared');
    await expect(dialog.getByRole('button', { name: 'Rename view', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('View name')).toHaveValue('Retained rename draft');
    await admin.orgs.updateOrgMemberRole({ orgId, userId: member.userId, role: 'admin' });
    await dialog.getByRole('button', { name: 'Check editing access' }).click();
    await expect(dialog.getByRole('button', { name: 'Rename view', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Rename view', exact: true }).click();
    await expect(dialog.getByText('Saved view renamed.')).toBeVisible();
    expect((await admin.views.getSavedView({ viewId: formerAdmin.id })).view?.ownerUserId).toBe(member.userId);
    await close(memberPage);

    for (let index = 1; index <= 21; index++) {
      await create('Paged personal ' + String(index).padStart(2, '0'));
      await create('Paged organization ' + String(index).padStart(2, '0'), 'organization');
    }
    await page.goto(taskPath);dialog = await open(page);const current = page.url();
    await dialog.getByRole('button', { name: 'Save current view' }).click();
    await dialog.getByLabel('View name').fill('Draft while paging');
    for (const label of ['Personal', 'Organization']) {
      const region = dialog.getByRole('region', { name: label + ' saved views', exact: true });
      await region.getByRole('searchbox').fill('Paged ' + label.toLowerCase());
      // Wait for the filtered server page, not just the immediate input value.
      await expect(region.getByText('20 shown · 21 total', { exact: true })).toBeVisible();
      await expect(region.locator('li')).toHaveCount(20);
      await region.getByRole('button', { name: 'Next ' + label + ' views', exact: true }).click();
      await expect(region.getByText('Paged ' + label.toLowerCase() + ' 21', { exact: true })).toBeVisible();
      await expect(region.locator('li')).toHaveCount(1);
    }
    await expect(dialog.getByLabel('View name')).toHaveValue('Draft while paging');expect(page.url()).toBe(current);await close(page);

    await admin.projects.archiveProject({ projectId: secondId });archived = true;
    dialog = await open(page);const intended = page.url();
    await dialog.getByRole('button', { name: 'Open Owner private', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('unavailable project');expect(page.url()).toBe(intended);
    await dialog.getByRole('button', { name: 'Delete Owner private', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete view', exact: true }).click();
    await expect(dialog.getByText('Saved view deleted.')).toBeVisible();
    await expect(admin.views.getSavedView({ viewId: privateA.id })).rejects.toMatchObject({ code: Code.NotFound });
    await close(page);
  } finally {
    try {
      const results = await Promise.allSettled([
        cleanup(owned),
        member && admin && orgId ? admin.orgs.updateOrgMemberRole({ orgId, userId: member.userId, role: 'member' }) : Promise.resolve(),
        archived && admin ? admin.projects.restoreProject({ projectId: secondId }) : Promise.resolve(),
      ]);
      if (results.some(result => result.status === 'rejected')) throw new Error('Owned saved-view fixture cleanup failed.');
    } finally { await memberContext.close();await foreignContext.close();await page.goto('about:blank'); }
  }
});

test('a personal Reports view saves its current window and reopens fresh project state across reload and history', async ({ page, context }) => {
  test.setTimeout(60_000);
  const owned: Owned[] = [], admin = await principal(context), space = await workspace(admin);
  try {
    await page.goto('/reports?org=' + space.orgId + '&project=' + space.second.id + '&days=90');
    let dialog = await open(page);
    await dialog.getByRole('button', { name: 'Save current view' }).click();
    await dialog.getByLabel('View name').fill('Quarterly operations');
    const response = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/CreateSavedView'));
    await dialog.getByRole('button', { name: 'Save view', exact: true }).click();
    const saved = await response;expect(saved.status()).toBe(200);
    const body = await saved.json() as { view?: { id?: string; visibility?: string } };
    if (!body.view?.id) throw new Error('The personal view was not returned.');
    owned.push({ id: body.view.id, owner: admin });expect(body.view.visibility).toBe('personal');
    const fresh = await admin.views.getSavedView({ viewId: body.view.id });
    expect(fresh.view?.projectId).toBe(space.second.id);expect(fresh.definition?.reports?.windowDays).toBe(90);
    await expect(dialog.getByText('View saved.', { exact: true })).toBeVisible();await close(page);
    const observed = new Set<string>();
    page.on('request', request => {
      if (request.method() !== 'POST' || !/\/(GetReportExceptions|GetReportTrends|GetUsageReport)$/.test(request.url())) return;
      const requestBody = request.postDataJSON() as { projectId?: string; windowDays?: number; days?: number };
      if (requestBody.projectId === space.second.id && (requestBody.windowDays ?? requestBody.days) === 90) observed.add(request.url().split('/').at(-1)!);
    });
    await page.goto('/reports?org=' + space.orgId + '&project=' + space.first.id + '&days=7');
    dialog = await open(page);await dialog.getByRole('button', { name: 'Open Quarterly operations', exact: true }).click();
    await expect(page.getByRole('button', { name: '90 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(space.second.id);
    await expect.poll(() => observed.size).toBe(3);
    await page.reload();await expect(page.getByRole('button', { name: '90 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();await expect(page.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.goForward();await expect(page.getByRole('button', { name: '90 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await cleanup(owned);await page.goto('about:blank'); }
});
