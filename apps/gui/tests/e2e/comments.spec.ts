import { test, expect } from '@playwright/test';

test.describe('Comments E2E rendering', () => {
  test('Creating a task comment with markdown bold rendering', async ({ page }) => {
    // NOTE: This assumes the app is running and seeded with a project containing at least one task.
    await page.goto('/tasks');

    await page.getByText(/./).first().waitFor();
    await page.locator('.bg-card.border.rounded-md').first().click();

    await page.getByPlaceholder('Add your comment... (Markdown supported)').fill('This is a **bold** comment');
    await page.getByRole('button', { name: /post/i }).click();

    const boldText = page.locator('strong', { hasText: 'bold' });
    await expect(boldText).toBeVisible();
  });
});
