import { test, expect } from '@playwright/test';

// Ported from the four specs that used to sit in apps/gui/e2e/, outside
// Playwright's configured testDir, and had therefore never run (M01-T08).
// Assertions that no longer describe the app were dropped rather than carried
// over: the Organizations spec expected an "Admin User" string and the
// Projects spec a "Software Development" template, neither of which exists.
//
// What survives is the intent worth keeping - every sidebar destination
// renders its own view - which is also M01's exit criterion that no reachable
// URL leaves the content area empty.
const ROUTES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/organizations', heading: 'Organizations & Settings' },
  { path: '/projects', heading: 'Projects' },
  { path: '/agents', heading: 'AI Agents' },
  { path: '/tasks', heading: 'Tasks Workbench' },
  { path: '/labels', heading: 'Labels' },
  { path: '/bin', heading: 'Bin' },
  // System Health moved here off the home screen; the route used to render
  // "Settings module placeholder area".
  { path: '/settings', heading: 'Settings' },
];

test.describe('Shell navigation', () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} renders its own view`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    });
  }

  test('/artifacts renders the explorer', async ({ page }) => {
    await page.goto('/artifacts');
    await expect(page.getByText('Artifacts Explorer')).toBeVisible();
  });

  // From the old tasks.spec.ts: the board renders its default columns. Keyed
  // off each column's "Add task to <column>" control rather than the column
  // label, whose element also carries the count ("Todo 15").
  test('/tasks renders the Kanban columns', async ({ page }) => {
    await page.goto('/tasks');
    for (const column of ['Todo', 'In Progress', 'Done']) {
      await expect(page.getByRole('button', { name: `Add task to ${column}` }).first()).toBeVisible();
    }
  });

  // From the old agents.spec.ts - dropped rather than carried over, for the
  // same reason this file's own top comment names for the Organizations and
  // Projects specs: no "Agent State Machine" heading, or state-machine
  // visualization of any kind, exists anywhere in the current Agents screen
  // (grep confirms - `AgentsDashboard` shows "AI Agent Instances", "Agent
  // Activity", "Agent Roles" instead). Found stale and failing in CI while
  // checking CI status for unrelated work; `/agents renders its own view`
  // above already covers the route not being empty.

  // M01-T02: an unknown URL is a Not Found view with a route back, not a blank
  // content area.
  test('an unknown URL renders Not Found, not an empty pane', async ({ page }) => {
    await page.goto('/definitely-not-a-route');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });
});
