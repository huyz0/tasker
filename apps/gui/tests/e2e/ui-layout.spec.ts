import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

test.beforeEach(async ({ context }) => {
  const backend = process.env.TASKER_E2E_BACKEND_URL;
  if (backend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: new URL(url.pathname + url.search, backend).href });
    await route.fulfill({ response });
  });
});
test.afterEach(async ({ context }) => context.unrouteAll({ behavior: 'ignoreErrors' }));

async function openSeededWork(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();
}

for (const width of [768, 1024]) {
  test(`task heading and every filter remain readable at ${width}px`, async ({ page }) => {
    await openSeededWork(page);
    await page.setViewportSize({ width, height: 900 });
    const heading = page.getByRole('heading', { level: 1, name: 'Tasks', exact: true });
    await expect.poll(async () => (await heading.boundingBox())?.width ?? 0).toBeGreaterThan(180);
    for (const control of [page.getByRole('button', { name: 'Table', exact: true }), page.getByPlaceholder('Filter tasks…'), page.getByRole('button', { name: 'Waiting on people', exact: true })]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
  });
}

test('mobile task content and properties share usable scrolling and preserve history', async ({ page }) => {
  await openSeededWork(page);
  await page.getByRole('heading', { level: 3 }).getByRole('button').first().click();
  const taskUrl = page.url();
  await page.setViewportSize({ width: 375, height: 900 });
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('heading', { level: 3 }).first();
  await expect.poll(() => title.evaluate(element => {
    let owner = element.parentElement;
    while (owner && getComputedStyle(owner).overflowY !== 'auto') owner = owner.parentElement;
    return owner?.clientHeight ?? 0;
  })).toBeGreaterThan(160);
  await expect(title).toBeInViewport({ ratio: 1 });
  await dialog.getByRole('combobox', { name: 'Priority', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('combobox', { name: 'Priority', exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Close task details', exact: true }).click();
  expect(new URL(page.url()).search).toBe(new URL(taskUrl).search);
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeVisible();
});

for (const theme of ['light', 'dark']) {
  test(`task states have distinct, consistent board/table treatments in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('tasker.theme', value), theme);
    await openSeededWork(page);
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const colors: Record<string, string> = {};
    for (const state of ['Todo', 'In Progress', 'Done']) {
      const badge = page.getByRole('cell').getByText(state, { exact: true }).first();
      await expect(badge).toBeVisible();
      let color = '';
      await expect.poll(async () => color = await badge.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('');
      colors[state] = color;
    }
    expect(new Set(Object.values(colors)).size).toBe(3);
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const state of ['Todo', 'In Progress', 'Done']) {
      const badge = page.getByText(state, { exact: true }).first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveCSS('background-color', colors[state]);
    }
  });
}


test('empty dashboard summaries use compact space beside populated panels', async ({ page }) => {
  await openSeededWork(page);
  const scope = new URL(page.url()).search;
  await page.route('**/tasker.health.v1.DashboardService/GetDashboard', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ awaitingReview: [], awaitingReviewCount: '0', disagreements: [], disagreementCount: '0',
      agents: Array.from({ length: 6 }, (_, i) => ({ id: `agent-${i}`, name: `Active agent ${i}`, openTaskCount: '1', lastUsedAt: new Date().toISOString() })), recentActivity: [] }),
  }));
  await page.goto(`/${scope}`);
  await expect(page.getByText('Nothing is waiting on your review.')).toBeVisible();
  const empty = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Waiting on you', exact: true }) });
  expect((await empty.boundingBox())!.height).toBeLessThan(140);
  const agents = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Agents', exact: true }) });
  expect((await agents.boundingBox())!.height).toBeGreaterThan((await empty.boundingBox())!.height);
  await expect(page.getByText('Active agent 5', { exact: true })).toBeVisible();
});

test('optional task context supports native keyboard disclosure and retains a summary draft', async ({ page }) => {
  await page.route('**/tasker.health.v1.TaskService/GetTask', async route => {
    const backend = process.env.TASKER_E2E_BACKEND_URL;
    const url = new URL(route.request().url());
    const response = await route.fetch(backend ? { url: new URL(url.pathname + url.search, backend).href } : {});
    const data = await response.json();
    delete data.task.summary; delete data.task.plan; delete data.task.usage;
    await route.fulfill({ response, json: data });
  });
  await openSeededWork(page);
  await page.getByRole('heading', { level: 3 }).getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('The agent has not shared a plan.')).toBeHidden();
  const plan = dialog.locator('summary').filter({ hasText: 'Agent plan' });
  await plan.focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByText('The agent has not shared a plan.')).toBeVisible();
  const summary = dialog.locator('summary').filter({ hasText: /^Summary$/ });
  await summary.click();
  await dialog.getByRole('button', { name: 'Write a summary' }).click();
  const draft = dialog.getByRole('textbox', { name: 'Summary', exact: true });
  await draft.fill('Keep this draft when collapsed');
  await summary.click();
  await expect(draft).toBeHidden();
  await summary.click();
  await expect(draft).toHaveValue('Keep this draft when collapsed');
});
