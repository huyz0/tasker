import { test, expect } from '@playwright/test';

test.describe('Universal Search E2E', () => {
  test('Command Palette can be opened', async ({ page }) => {
    await page.goto('/');

    // Wait on the dashboard's own heading rather than the "Tasker" brand: the
    // brand is rendered twice (mobile header and sidebar) and the first match
    // in DOM order is the `md:hidden` one, which is never visible at the
    // desktop viewport these tests run at.
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    // Same duplication for the search trigger - keep the visible one.
    const searchBtn = page
      .getByRole('button', { name: 'Search tasks, artifacts...' })
      .filter({ visible: true });
    await expect(searchBtn).toBeVisible();

    await searchBtn.click();

    // The palette input's placeholder was renamed at some point after this
    // spec was written ('Type a command or search...' -> the current, more
    // specific text below) - this assertion had gone stale and was failing
    // in CI ever since, found while checking CI status for unrelated work.
    const searchInput = page.getByPlaceholder('Search tasks, artifacts, projects, agents…');
    await expect(searchInput).toBeVisible();
  });
});
