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

async function rpc(page: Page, service: string, method: string, data: object, token?: string): Promise<any> {
  const response = await page.request.post(`${process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080'}/tasker.health.v1.${service}/${method}`, {
    data, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  expect(response.ok(), `${service}/${method}: ${response.status()}`).toBe(true);
  return response.json();
}

async function fixture(page: Page) {
  await selectSeededOrg(page);
  const name = `History ${Date.now()}`;
  const { organization: org } = await rpc(page, 'OrgService', 'SeedOrg', { name, slug: `history-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  const { template } = await rpc(page, 'ProjectTemplateService', 'CreateTemplate', { orgId: org.id, name, description: '' });
  const { project } = await rpc(page, 'ProjectService', 'CreateProject', { orgId: org.id, templateId: template.id, name, ownerId: 'dev-user' });
  const { taskType } = await rpc(page, 'TaskTypeService', 'CreateTaskType', { orgId: org.id, projectId: project.id, name });
  const ids: Record<string, string> = {};
  for (const status of ['todo', 'review', 'done']) {
    ids[status] = (await rpc(page, 'TaskTypeService', 'CreateTaskStatus', { taskTypeId: taskType.id, name: status })).status.id;
  }
  for (const destination of ['review', 'done']) {
    const { transition } = await rpc(page, 'TaskTypeService', 'CreateTaskStatusTransition', { taskTypeId: taskType.id, fromStatusId: ids.todo, toStatusId: ids[destination] });
    await rpc(page, 'TaskTypeService', 'SetTransitionApproval', { taskTypeId: taskType.id, transitionId: transition.id, requiresApproval: true });
  }
  const { role } = await rpc(page, 'AgentService', 'CreateAgentRole', { orgId: org.id, name, systemPrompt: 'Verify workflow.', capabilities: '[]' });
  const { agent } = await rpc(page, 'AgentService', 'CreateAgent', { orgId: org.id, agentRoleId: role.id, name: 'History worker' });
  const { plaintext } = await rpc(page, 'AgentService', 'CreateAgentToken', { agentId: agent.id, name, scopes: ['tasks:read', 'tasks:write'] });
  const createTask = async (title: string, projectId = project.id) => (await rpc(page, 'TaskService', 'CreateTask', {
    projectId, title, status: 'todo', taskTypeId: taskType.id, description: '',
  })).task;
  return { orgId: org.id, projectId: project.id, templateId: template.id, createTask, token: plaintext };
}

test('old pending work survives newer history, failed later pages and a durable stale decision', async ({ page }, info) => {
  const f = await fixture(page);
  const task = await f.createTask('Keep pending work reachable');
  await rpc(page, 'TaskService', 'RequestInput', { taskId: task.id, question: 'Old pending question', options: [] });
  const { pendingApproval } = await rpc(page, 'TaskService', 'UpdateTaskStatus', { taskId: task.id, status: 'done' }, f.token);
  for (let i = 0; i < 23; i++) {
    const { inputRequest } = await rpc(page, 'TaskService', 'RequestInput', { taskId: task.id, question: `Closed question ${i}`, options: [] });
    await rpc(page, 'TaskService', 'AnswerInputRequest', { id: inputRequest.id, answer: `Recorded answer ${i}` });
  }
  for (let i = 0; i < 13; i++) {
    const result = await rpc(page, 'TaskService', 'UpdateTaskStatus', { taskId: task.id, status: 'review' }, f.token);
    await rpc(page, 'TaskService', 'DecideTransitionApproval', { id: result.pendingApproval.id, approve: false, reason: `History decision ${i}` });
  }
  await page.goto(`/tasks/${task.id}?org=${f.orgId}&project=${f.projectId}`);
  const questions = page.getByRole('region', { name: 'Questions from agents' });
  const approvals = page.getByRole('region', { name: 'Status changes awaiting approval' });
  await expect(questions.getByText('Old pending question', { exact: true })).toBeVisible();
  await expect(questions.getByText('Showing 1 of 1 pending')).toBeVisible();
  await expect(approvals.getByRole('button', { name: 'Approve move' })).toBeVisible();
  await questions.getByLabel('Your answer').fill('Do not erase this answer');
  await expect(questions.locator('details')).not.toHaveAttribute('open');
  await questions.getByText('History · 23', { exact: true }).click();
  await expect(questions.getByText('Showing 20 of 23 closed')).toBeVisible();
  let failNext = true;
  await page.route('**/tasker.health.v1.TaskService/ListInputRequests', async route => {
    const body = route.request().postDataJSON();
    if (failNext && body.status === 'closed' && body.page?.cursor) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'History page temporarily offline' }) });
    } else await route.fallback();
  });
  await questions.getByRole('button', { name: 'Load more history' }).click();
  await expect(questions.getByRole('alert')).toContainText('History page temporarily offline');
  await expect(questions.getByRole('list', { name: 'Closed questions' }).getByRole('listitem')).toHaveCount(20);
  await expect(questions.getByLabel('Your answer')).toHaveValue('Do not erase this answer');
  failNext = false;
  await questions.getByRole('button', { name: 'Try again' }).click();
  await expect(questions.getByText('Showing 23 of 23 closed')).toBeVisible();
  await approvals.getByText('History · 13', { exact: true }).click();
  await expect(approvals.getByText('Showing 10 of 13 closed')).toBeVisible();
  await approvals.getByRole('button', { name: 'Load more history' }).click();
  await expect(approvals.getByText('Showing 13 of 13 closed')).toBeVisible();

  // A person moved the task before deciding the old agent request.
  await rpc(page, 'TaskService', 'UpdateTaskStatus', { taskId: task.id, status: 'review' });
  await approvals.getByRole('button', { name: 'Approve move' }).click();
  await expect(approvals.getByRole('alert')).toContainText('closed as stale');
  await expect(approvals.getByText('Showing 0 of 0 pending')).toBeVisible();
  await expect(approvals.getByText('History · 14', { exact: true })).toBeVisible();
  const persisted = await rpc(page, 'TaskService', 'GetTransitionApproval', { id: pendingApproval.id });
  expect(persisted.approval.status).toBe('stale');
  expect((await rpc(page, 'TaskService', 'GetTask', { taskId: task.id })).task.pendingApprovalCount ?? 0).toBe(0);
  await expect(questions.getByLabel('Your answer')).toHaveValue('Do not erase this answer');

  await page.setViewportSize({ width: 375, height: 850 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await approvals.getByRole('alert').scrollIntoViewIfNeeded();
  await page.evaluate(axe.source);
  const audit = await page.evaluate(async () => (window as any).axe.run(document.body, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }));
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('pending-history-mobile-dark.png'), animations: 'disabled' });
  await page.reload();
  await expect(approvals.getByRole('button', { name: 'Approve move' })).toHaveCount(0);
  await expect(approvals.getByText('History · 14', { exact: true })).toBeVisible();
});

test('organization queues reach pending rows after fifty across projects and retain first-page typing on retry', async ({ page }) => {
  const f = await fixture(page);
  const { project: other } = await rpc(page, 'ProjectService', 'CreateProject', { orgId: f.orgId, templateId: f.templateId, name: 'Other queue project', ownerId: 'dev-user' });
  // A task type belongs to its project. The second project's questions still
  // prove that the organization queue includes unselected projects.
  const foreignTask = (await rpc(page, 'TaskService', 'CreateTask', { projectId: other.id, title: 'Other project question', status: 'todo', description: '' })).task;
  await rpc(page, 'TaskService', 'RequestInput', { taskId: foreignTask.id, question: 'Other project pending question', options: [] });
  for (let i = 0; i < 51; i++) {
    const task = await f.createTask(`Pending queue ${i}`);
    await rpc(page, 'TaskService', 'RequestInput', { taskId: task.id, question: `Pending question ${i}`, options: [] });
    await rpc(page, 'TaskService', 'UpdateTaskStatus', { taskId: task.id, status: 'done' }, f.token);
  }
  await page.goto(`/tasks?org=${f.orgId}&project=${f.projectId}`);
  await page.getByRole('button', { name: 'Waiting on people', exact: true }).click();
  const queue = page.getByRole('dialog', { name: 'Waiting on people' });
  const questions = queue.getByRole('group', { name: 'Open questions', exact: true });
  const approvals = queue.getByRole('group', { name: 'Pending approvals', exact: true });
  await expect(questions.getByText('Showing 50 of 52 pending')).toBeVisible();
  await questions.getByLabel('Your answer').first().fill('Retained organization answer');
  let fail = true;
  await page.route('**/tasker.health.v1.TaskService/ListInputRequests', route => fail && route.request().postDataJSON().page?.cursor
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Queue page temporarily offline' }) }) : route.fallback());
  await questions.getByRole('button', { name: 'Load more pending' }).click();
  await expect(questions.getByRole('alert')).toContainText('Queue page temporarily offline');
  await expect(questions.getByLabel('Your answer').first()).toHaveValue('Retained organization answer');
  fail = false;
  await questions.getByRole('button', { name: 'Try again' }).click();
  await expect(questions.getByText('Showing 52 of 52 pending')).toBeVisible();
  await expect(questions.getByText('Other project pending question', { exact: true })).toBeVisible();
  await expect(questions.getByLabel('Your answer').first()).toHaveValue('Retained organization answer');
  await expect(approvals.getByText('Showing 50 of 51 pending')).toBeVisible();
  await approvals.getByRole('button', { name: 'Load more pending' }).click();
  await expect(approvals.getByText('Showing 51 of 51 pending')).toBeVisible();
});
