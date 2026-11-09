import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';
import { openWorkspaceSettings } from './workspaceSettings';

test('mobile keeps project context and scoped navigation visible', async ({ page }) => {
  await selectSeededOrg(page);
  await page.getByRole('button', { name: 'Active project', exact: true }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project', exact: true }).click();
  const projectName = 'Seed Project';
  const scope = new URL(page.url()).search;
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.getByLabel('Current project')).toHaveText(projectName);
  await expect(page.getByLabel('Current project')).toBeInViewport();
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await page.getByRole('link', { name: 'Workflows', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
  expect(new URL(page.url()).search).toBe(scope);
  await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toHaveAttribute('aria-expanded', 'false');
});

test('administration remains discoverable and auto-expands after a deep link', async ({ page }) => {
  await selectSeededOrg(page);
  await expect(page.getByRole('button', { name: 'Workspace settings', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await openWorkspaceSettings(page);
  await page.getByRole('link', { name: 'Roles', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Workspace settings', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: 'Roles', exact: true })).toHaveAttribute('aria-current', 'page');
});
