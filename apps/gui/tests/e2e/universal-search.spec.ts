import { test, expect } from '@playwright/test';

test.describe('Universal Search E2E', () => {
  test('Command Palette can be opened', async ({ page }) => {
    // Go to home page
    await page.goto('/');

    // Ensure the page has loaded
    await page.waitForSelector('text=Tasker');

    // The search button should be visible
    const searchBtn = page.getByText('Search tasks, artifacts...');
    await expect(searchBtn).toBeVisible();

    // Click it to open palette
    await searchBtn.click();

    // The input should appear
    const searchInput = page.getByPlaceholder('Type a command or search...');
    await expect(searchInput).toBeVisible();
  });
});
