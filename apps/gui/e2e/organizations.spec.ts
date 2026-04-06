import { test, expect } from '@playwright/test';

// Maps to TC-001: GUI Navigation - Organizations
test('GUI navigates to Organizations cleanly without placeholders', async ({ page }) => {
  await page.goto('/');
  await page.goto('/organizations');
  await expect(page.locator('h1')).toHaveText('Organizations & Settings');
  await expect(page.locator('text=Admin User')).toBeVisible();
});
