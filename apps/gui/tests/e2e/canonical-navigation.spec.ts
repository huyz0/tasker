import { test, expect, type Page } from '@playwright/test';
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

async function rpc<T>(page: Page, service: string, method: string, body: object): Promise<T> {
  const response = await page.request.post(`${process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080'}/tasker.health.v1.${service}/${method}`, { data: body });
  expect(response.ok(), `${service}/${method}: ${response.status()}`).toBe(true);
  return response.json();
}

async function projects(page: Page) {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  const url = new URL(page.url());
  const orgId = url.searchParams.get('org')!, projectA = url.searchParams.get('project')!;
  const { projects: rows } = await rpc<{ projects: { id: string; name: string }[] }>(page, 'ProjectService', 'ListProjects', { orgId, page: { limit: 100 } });
  const projectB = rows.find(row => row.id !== projectA)!;
  expect(projectB).toBeTruthy();
  return { orgId, projectA, projectB, origin: url.pathname + url.search };
}

for (const kind of ['task', 'artifact'] as const) {
  test(`${kind} search from A resolves B and preserves Back, Forward and reload`, async ({ page }, info) => {
    const { orgId, projectB, origin } = await projects(page);
    const title = `Canonical ${kind} ${Date.now()}`;
    let id: string;
    if (kind === 'task') {
      const response = await rpc<{ task: { id: string } }>(page, 'TaskService', 'CreateTask', { projectId: projectB.id, title, status: 'todo', description: 'Owned by project B' });
      id = response.task.id;
    } else {
      const { folder } = await rpc<{ folder: { id: string } }>(page, 'ArtifactService', 'CreateFolder', { projectId: projectB.id, parentId: '', name: title });
      const { artifact } = await rpc<{ artifact: { id: string } }>(page, 'ArtifactService', 'CreateArtifact', { folderId: folder.id, name: title, content: 'Owned artifact body', contentType: 'text/markdown', description: '' });
      id = artifact.id;
    }
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill(title);
    await page.getByRole('option').filter({ hasText: title }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(projectB.id);
    await expect(page.getByRole('button', { name: 'Active project', exact: true, hidden: true })).toContainText(projectB.name);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(projectB.name);
    expect(new URL(page.url()).pathname).toBe(`/${kind === 'task' ? 'tasks' : 'artifacts'}/${id}`);
    if (kind === 'task') await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    else await expect(page.getByText('Owned artifact body', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${kind}-owned.png`), fullPage: true, animations: 'disabled' });
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(origin);
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get('project')).toBe(projectB.id);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(projectB.name);
    expect(new URL(page.url()).searchParams.get('org')).toBe(orgId);
  });
}

for (const tier of ['project', 'organization', 'team'] as const) {
  test(`${tier} Memory direct link settles under its authorized tier`, async ({ page }, info) => {
    const { orgId, projectB, origin } = await projects(page);
    let scopeId = tier === 'project' ? projectB.id : orgId;
    if (tier === 'team') {
      const { team } = await rpc<{ team: { id: string } }>(page, 'TeamService', 'CreateTeam', { orgId, name: `Navigation team ${Date.now()}` });
      scopeId = team.id;
      await rpc(page, 'RoleService', 'GrantRole', { subjectType: 'user', subjectId: 'dev-user', scopeType: 'team', scopeId, roleId: 'role-admin' });
    }
    const statement = `Canonical ${tier} knowledge ${Date.now()}`;
    const { belief } = await rpc<{ belief: { id: string } }>(page, 'MemoryService', 'RecordBelief', { orgId, scopeType: tier, scopeId, statement, confidence: 'high' });
    await page.goto(`/memory/${belief.id}`);
    await expect(page.getByRole('region', { name: 'Belief detail' })).toContainText(statement);
    await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBe(tier);
    await expect(page.getByRole('button', { name: 'Active organization' })).toContainText('Seed Org');
    if (tier === 'project') {
      await expect(page.getByRole('button', { name: 'Active project', exact: true, hidden: true })).toContainText(projectB.name);
    } else {
      await expect(page.getByRole('button', { name: 'Active project', exact: true })).toContainText('No projects');
      expect(new URL(page.url()).searchParams.has('project')).toBe(false);
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).not.toContainText(projectB.name);
    }
    if (tier === 'team') {
      await expect(page.getByRole('button', { name: 'Record belief', exact: true })).toHaveCount(0);
      await expect(page.getByText(/Team memory/)).toBeVisible();
    }
    await page.reload();
    await expect(page.getByRole('region', { name: 'Belief detail' })).toContainText(statement);
    expect(new URL(page.url()).searchParams.get('project')).toBe(tier === 'project' ? projectB.id : null);
    await page.screenshot({ path: info.outputPath(`${tier}-memory.png`), fullPage: true, animations: 'disabled' });
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(origin);
    await page.goForward();
    await expect(page.getByRole('region', { name: 'Belief detail' })).toContainText(statement);
    if (tier === 'team') {
      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Memory', exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('scope')).toBe('organization');
      expect(new URL(page.url()).searchParams.has('project')).toBe(false);
    }
  });
}
