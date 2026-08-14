import { test, expect } from '@playwright/test';

test.describe('Comments E2E rendering', () => {
  test('Creating a task comment with markdown bold rendering', async ({ page }) => {
    // Needs a backend seeded with at least one task - `bun run seed` from
    // apps/backend, which CI does before this job.
    await page.goto('/tasks');

    // Board cards are the role=button elements carrying a task title (h4),
    // which distinguishes them from the column "+" buttons without pinning the
    // test to Tailwind class names that change with any restyle.
    const firstTaskCard = page
      .getByRole('button')
      .filter({ has: page.locator('h4') })
      .first();
    await expect(firstTaskCard).toBeVisible({ timeout: 30_000 });
    await firstTaskCard.click();

    // Opening a card is a route change now (`/tasks/:taskId`), so wait for the
    // detail overlay before typing into it.
    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible();

    const body = `E2E **bold** check ${Date.now()}`;
    await page.getByPlaceholder('Add your comment... (Markdown supported)').fill(body);
    await page.getByRole('button', { name: /post comment/i }).click();

    await expect(page.locator('strong', { hasText: 'bold' }).first()).toBeVisible();
  });
});
