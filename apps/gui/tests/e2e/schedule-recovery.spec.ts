import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';
import { controlLiveFeed, currentFeed } from './controlledLiveFeed';

test.beforeEach(async ({ page, context }) => {
  const privateBackend = process.env.TASKER_E2E_BACKEND_URL;
  if (privateBackend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: new URL(url.pathname + url.search, privateBackend).href });
      await route.fulfill({ response });
    } catch (error) {
      // Context shutdown can dispose an in-flight background response.
      if (!route.request().frame().page().isClosed()) throw error;
    }
  });
  // Keep one healthy, project-narrowed stream. No schedule event is injected;
  // source reads must reconcile work outside that feed's scope on their own.
  await controlLiveFeed(page);
});

async function createOutsideFeed(page: Page) {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  const projectA = new URL(page.url()).searchParams.get('project');
  await page.getByRole('link', { name: 'Schedules', exact: true }).first().click();
  await page.getByRole('button', { name: 'New schedule', exact: true }).click();
  const name = `Recovery evidence ${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Project', { exact: true }).selectOption({ label: 'Bulk Project 00000' });
  const projectB = await page.getByLabel('Project', { exact: true }).inputValue();
  await page.getByLabel(/Task title/).fill(`${name} task`);
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('It has not run yet.', { exact: true })).toBeVisible();
  const feed = await currentFeed(page);
  expect(await page.evaluate(id => window.__recoveryFeed.connections[id].projectId, feed)).toBe(projectA);
  expect(projectB).not.toBe(projectA);
  expect(new URL(page.url()).searchParams.get('project')).toBe(projectA);
  return { name, projectA, projectB };
}

for (const initial of ['empty', 'terminal'] as const) {
  test(`off-feed ${initial} history refreshes real creation and opens its owning project`, async ({ page }, info) => {
    const { name, projectA, projectB } = await createOutsideFeed(page);
    if (initial === 'terminal') {
      await page.getByRole('button', { name: 'Run now', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Runs' }).getByText('Work created', { exact: true })).toBeVisible();
    }
    const oldRows = await page.getByRole('list', { name: 'Runs' }).count()
      ? await page.getByRole('list', { name: 'Runs' }).locator('li').count() : 0;
    await page.clock.install();
    const other = await page.context().newPage();
    await controlLiveFeed(other);
    await other.goto(page.url());
    await other.getByRole('button', { name: 'Run now', exact: true }).click();
    await expect(other.getByRole('main').getByRole('status')).toContainText(initial === 'empty' ? 'Work created' : 'Skipped');
    try {
      const historyRead = page.waitForRequest(r => r.url().endsWith('/ScheduleService/ListScheduleRuns')
        || r.url().endsWith('/tasker.health.v1.ScheduleService/ListScheduleRuns'));
      const detailRead = page.waitForRequest(r => r.url().endsWith('/tasker.health.v1.ScheduleService/GetSchedule'));
      await page.clock.fastForward(15_000);
      expect((await (await historyRead).response())?.ok()).toBe(true);
      expect((await (await detailRead).response())?.ok()).toBe(true);
      const runs = page.getByRole('list', { name: 'Runs' });
      await expect(runs.locator('li')).toHaveCount(oldRows + 1);
      await expect(runs).toContainText(initial === 'empty' ? 'Work created' : 'Skipped');
      await expect(runs).toContainText('Attempt 1');
      expect(new URL(page.url()).searchParams.get('project')).toBe(projectA);
      await page.setViewportSize({ width: 375, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`history-${initial}-375.png`), fullPage: true, animations: 'disabled' });
      const link = runs.getByRole('link', { name: 'Open created task' }).first();
      expect(new URL((await link.getAttribute('href'))!, page.url()).searchParams.get('project')).toBe(projectB);
      await link.click();
      await expect(page.getByRole('heading', { name: new RegExp(`${name} task`) })).toBeVisible();
      expect(new URL(page.url()).searchParams.get('project')).toBe(projectB);
    } finally { await other.close(); }
  });
}

test('a failed off-feed refresh keeps the unsaved editor through retry and recovery', async ({ page }, info) => {
  await createOutsideFeed(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const draft = `Unsaved recovery draft ${Date.now()}`;
  await page.getByLabel('Name', { exact: true }).fill(draft);
  let unavailable = true;
  await page.route('**/tasker.health.v1.ScheduleService/GetSchedule', async route => {
    if (!unavailable) return route.fallback();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Controlled refresh outage' }) });
  });
  // Ordinary query retries remain enabled. Let the actual interval and bounded
  // retry timers run; the editor must survive the final error and its recovery.
  await page.clock.install();
  for (let attempt = 0; attempt < 4; attempt++) {
    const failedRead = page.waitForResponse(r => r.url().endsWith('/tasker.health.v1.ScheduleService/GetSchedule') && r.status() === 503);
    await page.clock.fastForward(attempt === 0 ? 15_000 : 8_000);
    await (await failedRead).finished();
    // Allow the real rejected fetch to settle before advancing its next retry.
    await page.clock.runFor(250);
  }
  await expect(page.getByRole('alert')).toContainText('Your draft is kept');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(draft);
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('draft-refresh-error-375.png'), fullPage: true, animations: 'disabled' });
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(draft);
});
