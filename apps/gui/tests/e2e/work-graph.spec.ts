import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * The work graph against the real backend (M35, ADR-0028): priority and a
 * blocking link set from the task dialog show on the board, and "Ready only"
 * hides the blocked task. Creates its own uniquely named tasks, so it is
 * re-runnable against the same seed. Needs a backend started with
 * `ENABLE_TEST_LOGIN=true`, as every spec here does (see selectSeededOrg.ts).
 */
async function addTodo(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add task to Todo' }).first().click();
  const input = page.getByPlaceholder('Task title');
  await input.fill(title);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe('Work graph', () => {
  test('priority and a blocker set in the dialog show on the board, and ready-only hides blocked work', async ({ page }) => {
    await selectSeededOrg(page);
    const stamp = String(Date.now());
    const blocker = `WG blocker ${stamp}`;
    const blocked = `WG blocked ${stamp}`;
    await addTodo(page, blocker);
    await addTodo(page, blocked);

    await page.getByRole('button', { name: blocked, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Priority').selectOption({ label: 'Urgent' });
    await expect(dialog.getByLabel('Priority')).toHaveValue('1');

    await dialog.getByRole('button', { name: 'Add blocker…' }).click();
    await dialog.getByLabel('Blocked by which task?').fill(blocker);
    await dialog.getByRole('button', { name: new RegExp(blocker) }).click();
    await expect(dialog.getByText('Blocked by')).toBeVisible();
    await expect(dialog.getByRole('link', { name: new RegExp(blocker) })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close task details' }).click();

    const card = page.locator('[draggable]').filter({ hasText: blocked });
    await expect(card.getByText('Urgent', { exact: true })).toBeVisible();
    await expect(card.getByText('Blocked', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ready only' }).click();
    await expect(page.locator('[draggable]').filter({ hasText: blocked })).toHaveCount(0);
    await expect(page.locator('[draggable]').filter({ hasText: blocker })).toBeVisible();
  });
});
