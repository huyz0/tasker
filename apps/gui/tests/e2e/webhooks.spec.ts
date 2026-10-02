import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * Organization → Webhooks against the real backend (M37): an admin adds a
 * webhook, sees its secret once, pauses it and deletes it. The endpoint is a
 * real public host so URL validation passes without WEBHOOKS_ALLOW_PRIVATE; it
 * subscribes only to tasknote.deleted and is deleted at the end, so the suite
 * sends it nothing. Needs a backend started with `ENABLE_TEST_LOGIN=true`.
 */
test.describe('Webhooks', () => {
  test('an admin adds, pauses and deletes a webhook, and its secret is shown once', async ({ page }) => {
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Organizations' }).first().click();
    await page.getByRole('tab', { name: 'Webhooks' }).click();
    const panel = page.getByRole('tabpanel', { name: 'Webhooks' });

    const url = `https://example.com/tasker-e2e-${Date.now()}`;
    await panel.getByRole('button', { name: 'Add webhook' }).click();
    await panel.getByLabel('Endpoint URL').fill(url);
    await panel.getByLabel('All task events').uncheck();
    await panel.getByText('Specific events').click();
    await panel.getByLabel('tasknote.deleted').check();
    await panel.getByRole('button', { name: 'Add webhook' }).last().click();

    const secret = panel.getByRole('status');
    await expect(secret).toContainText('not shown again');
    await expect(secret).toContainText('whsec_');
    await secret.getByRole('button', { name: 'Done' }).click();
    await expect(panel.getByText(/whsec_/)).toHaveCount(0);

    const row = panel.getByRole('listitem').filter({ hasText: url });
    await expect(row).toContainText('tasknote.deleted');
    await expect(row.getByText('Active', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Pause' }).click();
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: url })).toHaveCount(0);
  });
});
