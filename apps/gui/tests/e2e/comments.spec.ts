import { test, expect } from '@playwright/test';

test.describe('Comments E2E rendering', () => {
  test('Creating a task comment with markdown bold rendering', async ({ page }) => {
    // Scaffold test for Scenario 1 defined in TEST-PLAN-0014
    // NOTE: This assumes the app is running and seeded with appropriate data.
    await page.goto('/');

    // TODO: Navigate to Task detail screen
    // await page.getByRole('link', { name: /Task /i }).first().click();

    // Write comment
    await page.getByPlaceholder('Add your comment...').fill('This is a **bold** comment');
    await page.getByRole('button', { name: /post/i }).click();

    // Verify markdown renderer outputs strong tags
    const boldText = page.locator('strong', { hasText: 'bold' });
    await expect(boldText).toBeVisible();
  });

  test('AI notes emit distinct styling boundaries', async ({ page }) => {
    // Scaffold test for Scenario 2 defined in TEST-PLAN-0014
    await page.goto('/');

    // Click the simulate helper button
    await page.getByTestId('inject-ai-note').click();

    // Verify the agent note renders distinctly with border-primary/20
    const agentNode = page.locator('.border-primary\\/20');
    await expect(agentNode).toBeVisible();
    await expect(page.getByText('🤖 Agent Alpha')).toBeVisible();
  });
});
