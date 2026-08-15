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

    // Click the *title*, not the card. Playwright clicks an element's centre,
    // and the card's centre is now the assignee picker, which deliberately
    // stops propagation so that choosing an assignee does not also open the
    // task. Clicking the card body therefore does nothing — correct behaviour,
    // and the reason this spec had been failing since the picker landed.
    await firstTaskCard.locator('h4').click();

    // Opening a card is a route change now (`/tasks/:taskId`), so wait for the
    // detail overlay before typing into it.
    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible();

    const stamp = String(Date.now());
    await page
      .getByPlaceholder('Add your comment... (Markdown supported)')
      .fill(`E2E **bold** check ${stamp}`);
    await page.getByRole('button', { name: /post comment/i }).click();

    // Anchored to this run's stamp. Asserting on any `strong` containing "bold"
    // would pass on a comment left behind by a previous run, so the test would
    // survive the post silently failing.
    const posted = page.locator('p', { hasText: `check ${stamp}` }).first();
    await expect(posted).toBeVisible();
    await expect(posted.locator('strong', { hasText: 'bold' })).toBeVisible();
  });
});
