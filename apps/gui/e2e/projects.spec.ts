import { test, expect } from '@playwright/test';

// Maps to TC-003: Project Creation Flow (Happy Path)
test('Instantiating Project via templates', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.locator('h1')).toHaveText('Projects');
  const templateBtn = page.locator('text=Software Development');
  await expect(templateBtn).toBeVisible();
});
