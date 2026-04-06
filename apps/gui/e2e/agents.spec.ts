import { test, expect } from '@playwright/test';

// Maps to TC-005: React Flow Visualization
test('Load Agent Dashboard with visual flow canvas', async ({ page }) => {
  await page.goto('/agents');
  await expect(page.locator('h2', { hasText: 'Agent State Machine' })).toBeVisible();
  await expect(page.locator('text=React Flow Component')).toBeVisible();
});
