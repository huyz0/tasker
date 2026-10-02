import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

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

    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByText(/Ran now: created/)).toBeVisible();
    const runs = page.getByRole('list', { name: 'Runs' });
    await expect(runs).toContainText('run by hand');

    await page.getByRole('button', { name: 'Run now' }).click();
    await expect(page.getByText(/Ran now: skipped/)).toBeVisible();
    await expect(runs).toContainText('is still open');

    await runs.getByRole('link', { name: 'open task' }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(`${name} task`) })).toBeVisible();
  });
});
