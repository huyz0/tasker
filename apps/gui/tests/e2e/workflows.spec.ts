import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * Workflows against the real backend (M42): a person defines a two-step
 * workflow where the second step waits for the first, starts it in the active
 * project, and lands on the parent task with both steps as subtasks. Needs a
 * backend started with `ENABLE_TEST_LOGIN=true`.
 */
test.describe('Workflows', () => {
  test('define a workflow, start it, and open the parent with its wired steps', async ({ page }) => {
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Workflows' }).first().click();
    await page.getByRole('button', { name: 'New workflow' }).click();

    const name = `E2E release ${Date.now()}`;
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Step 1 title').fill('Build the artifacts');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 2 title').fill('Ship the release');
    await page.getByRole('group', { name: 'Step 2 waits for' }).getByLabel('Build the artifacts').check();
    await page.getByRole('button', { name: 'Save workflow' }).click();

    const steps = page.getByRole('list', { name: 'Workflow steps' });
    await expect(steps).toContainText('Ship the release');
    await expect(steps).toContainText('after Build the artifacts');

    await page.getByLabel('Title for this run').fill(`${name} run`);
    await page.getByRole('button', { name: 'Start workflow' }).click();
    const started = page.getByRole('link', { name: new RegExp(`${name} run`) });
    await expect(started).toBeVisible();
    await started.click();

    // The parent task's relations list both steps as subtasks.
    await expect(page.getByRole('heading', { name: `${name} run` })).toBeVisible();
    await expect(page.getByText('Build the artifacts')).toBeVisible();
    await expect(page.getByText('Ship the release')).toBeVisible();
  });
});
