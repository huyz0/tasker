import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';
import { controlLiveFeed } from './controlledLiveFeed';

test.beforeEach(async ({ page, context }) => {
  const privateBackend = process.env.TASKER_E2E_BACKEND_URL;
  if (privateBackend) await context.route('http://localhost:8080/**', async route => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({ url: new URL(url.pathname + url.search, privateBackend).href });
      await route.fulfill({ response, body: await response.body() });
    } catch (error) {
      // Context shutdown can dispose an in-flight background response.
      if (!route.request().frame().page().isClosed()) throw error;
    }
  });
  await controlLiveFeed(page);
});

test.afterEach(async ({ context }) => {
  // Assertions are complete; handlers cancelled by optional proxy teardown
  // must not turn a finished task-detail read into a fixture-disposal failure.
  await context.unrouteAll({ behavior: 'ignoreErrors' });
});

/**
 * Schedules against the real backend (M43): a person creates a weekly
 * schedule for one task, runs it now, follows the run to the task it made,
 * and a second Run now is skipped while that task is open. Needs a backend
 * started with `ENABLE_TEST_LOGIN=true`.
 */
test.describe('Schedules', () => {
  test('create a schedule, run it now, and see the run and its task', async ({ page }) => {
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Schedules' }).first().click();
    await page.getByRole('button', { name: 'New schedule' }).click();

    const name = `E2E triage ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    const project = page.locator('#schedule-project');
    if ((await project.inputValue()) === '') await project.selectOption({ index: 1 });
    await page.getByRole('group', { name: 'Weekdays' }).getByText('Thu').click();
    await expect(page.locator('form').getByText('Every Mon, Thu at 09:00 UTC')).toBeVisible();
    await page.getByLabel(/Task title/).fill(`${name} task`);
    await page.getByRole('button', { name: 'Save schedule' }).click();

    await page.setViewportSize({ width: 375, height: 900 });
    const heading = page.getByRole('heading', { name });
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.width).toBeGreaterThan(240);
    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('Work created');
    const runs = page.getByRole('list', { name: 'Runs' });
    await expect(runs).toContainText('run by hand');
    await expect(runs).toContainText('Attempt 1');
    await expect(runs).toContainText('Accepted');
    await expect(runs).toContainText('Completed');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByRole('main').getByRole('status')).toContainText('Skipped');
    await expect(runs).toContainText('is still open');

    await runs.getByRole('link', { name: 'Open created task' }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(`${name} task`) })).toBeVisible();
  });
});
