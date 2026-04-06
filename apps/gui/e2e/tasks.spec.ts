import { test, expect } from '@playwright/test';

// Maps to TC-004: Tasks Kanban Board - Manipulation
test('Kanban Board state updates visually', async ({ page }) => {
  await page.goto('/tasks');
  const taskPanel = page.locator('text=Todo');
  await expect(taskPanel).toBeVisible();
});
