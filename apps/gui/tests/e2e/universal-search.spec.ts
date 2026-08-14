import { test, expect } from '@playwright/test';

test.describe('Universal Search E2E', () => {
  test('Command Palette can be opened', async ({ page }) => {
    await page.goto('/');

    // Wait on the dashboard's own heading rather than the "Tasker" brand: the
    // brand is rendered twice (mobile header and sidebar) and the first match
    // in DOM order is the `md:hidden` one, which is never visible at the
    // desktop viewport these tests run at.
    await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();

    // Same duplication for the search trigger - keep the visible one.
    const searchBtn = page
      .getByRole('button', { name: 'Search tasks, artifacts...' })
      .filter({ visible: true });
    await expect(searchBtn).toBeVisible();

    await searchBtn.click();

    const searchInput = page.getByPlaceholder('Type a command or search...');
    await expect(searchInput).toBeVisible();
  });
});
