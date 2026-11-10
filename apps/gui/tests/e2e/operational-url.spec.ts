import { test, expect } from '@playwright/test';

const api = process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080';
test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 375, height: 900 } });

test('keeps fast keyboard text intact while URL navigation, reload and history own the applied task view', async ({ page, context }) => {
  const login = await context.request.get(`${api}/api/auth/test/inject?userId=dev-user`);
  if (!login.ok()) throw new Error('Owned browser session setup failed.');
  await page.goto('/tasks?view=table');
  const input = page.getByRole('searchbox', { name: 'Filter tasks', exact: true });
  await input.focus();await page.keyboard.type('Release regression');
  await expect(input).toHaveValue('Release regression');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Release regression');
  await page.reload();await expect(input).toHaveValue('Release regression');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Tabbing across the wide table must scroll its shared header into reach.
  await page.getByRole('columnheader', { name: 'Title', exact: true }).getByRole('button').focus();
  await page.keyboard.press('Tab');
  const statusSort = page.getByRole('columnheader', { name: 'Status', exact: true }).getByRole('button');
  await expect(statusSort).toBeFocused();
  const statusBox = await statusSort.boundingBox();
  expect(statusBox).not.toBeNull();
  expect(statusBox!.x).toBeGreaterThanOrEqual(0);
  expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press('Space');
  await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toHaveAttribute('aria-sort', 'ascending');
  await page.getByRole('button', { name: 'Board', exact: true }).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(input).toHaveValue('Release regression');
  await page.goForward();await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
