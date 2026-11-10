import { test, expect, type Page } from '@playwright/test';

const backend = process.env.TASKER_E2E_BACKEND_URL;
test.beforeEach(async ({ context }) => {
  if (backend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    // Continue the request so Connect streaming bytes are never buffered.
    await route.continue({ url: new URL(url.pathname + url.search, backend).href });
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
  const identity = await rpc<{ user: { id: string; name: string } }>(page, 'AuthService', 'GetIdentity', {});
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
  return { orgId: organization.id, projects, tasks, userId: identity.user.id, userName: identity.user.name };
}


const taskDialog = (page: Page) => page.getByRole('dialog', { name: 'Task Details', exact: true });

test('an existing task answer drains Attention while summary writing survives contextual refresh and Back', async ({ page }) => {
  const f = await fixture(page, 1); await page.goto(`/attention?org=${f.orgId}&kind=question`);
  const attention = page.getByRole('region', { name: 'Questions', exact: true }); await expect(attention.getByText('1 loaded of 1')).toBeVisible();
  await attention.getByRole('link', { name: /^Open task/ }).press('Enter'); await expect(taskDialog(page)).toBeVisible();
  const summary = taskDialog(page).getByRole('heading', { name: 'Summary', exact: true }).locator('xpath=ancestor::details[1]');
  if (await summary.getAttribute('open') === null) await summary.locator('summary').click();
  await taskDialog(page).getByRole('button', { name: 'Write a summary', exact: true }).click();
  const draft = `Human review intent ${Date.now()}`; await taskDialog(page).getByRole('textbox', { name: 'Summary', exact: true }).fill(draft);
  const questions = taskDialog(page).getByRole('region', { name: 'Questions from agents' });
  await questions.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Ship to staging');
  await questions.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(questions.getByRole('textbox', { name: 'Your answer', exact: true })).toHaveCount(0);
  await expect(taskDialog(page).getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
  await page.goBack(); await expect(attention.getByText('0 loaded of 0')).toBeVisible();
  await page.goForward(); await expect(taskDialog(page).getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(draft);
  await taskDialog(page).getByRole('button', { name: 'Cancel', exact: true }).first().click();
  const current = await rpc<{ task: { status: string } }>(page, 'TaskService', 'GetTask', { taskId: f.tasks[0]!.id }); expect(current.task.status).toBe('todo');
});

test('removing a review responsibility through the current task picker clears its source without completing the task', async ({ page }) => {
  const f = await fixture(page, 0); await rpc(page, 'TaskService', 'AddTaskReviewer', { taskId: f.tasks[0]!.id, userId: f.userId });
  await page.goto(`/attention?org=${f.orgId}&kind=review`); const attention = page.getByRole('region', { name: 'Your reviews', exact: true });
  await expect(attention.getByText('1 loaded of 1')).toBeVisible(); await attention.getByRole('link', { name: /^Open task/ }).click();
  await taskDialog(page).getByRole('button', { name: `Remove ${f.userName} as a reviewer`, exact: true }).click();
  await expect(taskDialog(page).getByText('No reviewers', { exact: true })).toBeVisible();
  await page.goBack(); await expect(attention.getByText('0 loaded of 0')).toBeVisible();
  const current = await rpc<{ task: { status: string } }>(page, 'TaskService', 'GetTask', { taskId: f.tasks[0]!.id }); expect(current.task.status).toBe('todo');
});

test('separate-client questions reconcile over the configured broker and after a browser network gap before the15s poll', async ({ page, context }) => {
  test.skip(process.env.TASKER_ATTENTION_LIVE_EVENTS !== '1', 'Explicit live integration requires a configured owned broker; standalone discovery still polls.');
  const f = await fixture(page, 0); await page.goto(`/attention?org=${f.orgId}&kind=question`);
  const attention = page.getByRole('region', { name: 'Questions', exact: true }); await expect(attention.getByText('0 loaded of 0')).toBeVisible();
  await expect(page.getByTestId('live-status').first()).toHaveAttribute('data-status', 'live');
  // A separate native client bypasses GUI query invalidation and keeps its
  // transient session credential outside page evaluation and traces.
  const base = backend || 'http://localhost:8080', login = await fetch(`${base}/api/auth/test/inject?userId=dev-user`);
  const cookie = login.headers.get('set-cookie')?.split(';')[0]; expect(!!cookie).toBe(true);
  async function nativeRpc<T>(method: string, body: object): Promise<T> {
    const response = await fetch(`${base}/tasker.health.v1.TaskService/${method}`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json', 'connect-protocol-version': '1' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`${method}: ${response.status}`); return response.json();
  }
  const first = await nativeRpc<{ inputRequest: { id: string } }>('RequestInput', { taskId: f.tasks[0]!.id, question: 'Separate-client live question', options: [] });
  await expect(attention.getByText('Separate-client live question', { exact: true })).toBeVisible({ timeout: 5000 });
  await nativeRpc('AnswerInputRequest', { id: first.inputRequest.id, answer: 'Acknowledged by the other client' });
  await expect(attention.getByText('0 loaded of 0')).toBeVisible({ timeout: 5000 });
  const gapStarted = Date.now();
  try {
    await context.setOffline(true);
    // Chromium can preserve an already-open HTTP stream while offline. This
    // asserts browser network state, not a severed stream or broker outage.
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await nativeRpc('RequestInput', { taskId: f.tasks[1]!.id, question: 'Question committed during the network gap', options: [] });
    await context.setOffline(false);
    await expect(attention.getByText('Question committed during the network gap', { exact: true })).toBeVisible({ timeout: 5000 });
    expect(Date.now() - gapStarted).toBeLessThan(14_000);
  } finally { await context.setOffline(false); }
});
