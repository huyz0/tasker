import { test, expect } from '@playwright/test';

// The dashboard is the one screen where the unit tests prove the least. Every
// panel is a server-side join across tables the browser never sees, so a mocked
// `getDashboard` will happily render four beautiful panels over a handler that
// returns nothing. Two defects this session were invisible to jsdom and visible
// here: `max(lastUsedAt)` bypasses drizzle's decoding and returns seconds, so
// every agent read as last seen in 1970; and a stale Vite module cache served a
// service descriptor without the new method, so the page made no request at all.
//
// These run against the real backend, so they assert the *shape* of a live
// answer rather than exact seeded rows: a panel is either populated or says why
// it is empty, and the RPC is actually reached.

test.describe('Dashboard', () => {
  test('asks the backend and renders all four supervision panels', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('DashboardService')) calls.push(r.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

    for (const panel of [
      'Waiting on you',
      'Done, but the PR is open',
      'Agents',
      'Recent agent activity',
    ]) {
      await expect(page.getByRole('heading', { name: panel, level: 2 })).toBeVisible();
    }

    // The absence of a request, not its failure, was the signal last time.
    expect(calls.length).toBeGreaterThan(0);
  });

  test('never leaves a panel blank — it is populated or it explains itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Waiting on you', level: 2 })).toBeVisible();

    const panels = page.locator('section').filter({ has: page.getByRole('heading', { level: 2 }) });
    const count = await panels.count();
    expect(count).toBe(4);

    for (let i = 0; i < count; i++) {
      const body = await panels.nth(i).innerText();
      // Heading + subtitle is two lines; anything real adds a third.
      expect(body.split('\n').filter((l) => l.trim()).length).toBeGreaterThan(2);
    }
  });

  test('does not report a live agent as last seen in 1970', async ({ page }) => {
    await page.goto('/');
    const agents = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Agents', level: 2 }),
    });
    await expect(agents).toBeVisible();

    // `max()` on a `mode: "timestamp"` column returns seconds, not ms. Reading
    // it as ms puts every agent ~55 years in the past, which renders as a
    // five-digit day count rather than anything a supervisor could act on.
    await expect(agents.getByText(/\d{5,}d ago/)).toHaveCount(0);
  });

  // Moving System Health to `/settings` was only half the move: the route was
  // reachable by URL but had no sidebar entry, so telemetry was effectively
  // deleted rather than relocated. Navigating by click is what proves it.
  test('reaches System Health from the sidebar, not just by typing the URL', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'System Health', level: 2 })).toBeVisible();
  });

  test('serves backend telemetry at /settings, off the home screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Ping Backend' })).toHaveCount(0);

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'System Health', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ping Backend' })).toBeVisible();
    await expect(page.getByText(/placeholder area/)).toHaveCount(0);
  });
});
