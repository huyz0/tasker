import { test, expect, type Page, type Request } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * The Reports screen against the real backend (M24-T10).
 *
 * The feature tests prove every card renders from a mocked wire shape; what
 * only this can prove is that the two report RPCs answer over a live seeded
 * database, that the screen is reachable by clicking (not just by URL), and
 * that Unassign — the screen's one write — travels row → confirm dialog →
 * `unassignTask` → refreshed `getReportExceptions` with the row gone.
 *
 * Needs `bun run seed` (apps/backend) — CI runs it before this job. The seed
 * writes `task_activity` journeys with day-old timestamps, so the stalled
 * panel (silent > 24h) is deterministically populated: ~14 agent-held claims
 * whose last signal is days old. The Unassign test consumes one per run;
 * re-seeding restores the fixture (each seed run creates a fresh org, and
 * `selectSeededOrg` picks the newest).
 *
 * Like dashboard.spec.ts, requests are observed rather than mocked: the
 * absence of a request, not its failure, was the historical failure mode.
 */

const EXCEPTIONS_RPC = 'ReportService/GetReportExceptions';
const TRENDS_RPC = 'ReportService/GetReportTrends';

/**
 * Points the switcher at the seed script's project. `selectSeededOrg` pins the
 * org; this pins the project inside it, because the switcher auto-selects
 * `projects[0]` (newest-first) and the seed also creates "Bulk Project …"
 * rows — whichever happens to be newest is not necessarily "Seed Project".
 */
async function selectSeededProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Active project' }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill('Seed Project');
  await page.getByRole('option', { name: 'Seed Project' }).first().click();
  await expect(page.getByRole('button', { name: 'Active project' })).toContainText('Seed Project');
}

/** Seeded org + seeded project, then to /reports through the sidebar link. */
async function openReports(page: Page): Promise<void> {
  await selectSeededOrg(page);
  await selectSeededProject(page);
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible({ timeout: 15_000 });
}

test.describe('Reports', () => {
  test('is reached from the sidebar and both report RPCs answer', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('ReportService')) calls.push(r.url());
    });

    await selectSeededOrg(page);
    await selectSeededProject(page);

    // Registered before the click: `waitForResponse` only sees future
    // responses, and a fast backend can answer before an after-the-fact waiter
    // starts listening.
    const exceptionsPromise = page.waitForResponse((r) => r.url().includes(EXCEPTIONS_RPC), { timeout: 15_000 });
    const trendsPromise = page.waitForResponse((r) => r.url().includes(TRENDS_RPC), { timeout: 15_000 });

    // By click, not by URL — the nav entry existing is part of what T08 shipped.
    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible({ timeout: 15_000 });

    // Both RPCs answered 200 — reached AND authorized, not merely attempted.
    const [exceptions, trends] = await Promise.all([exceptionsPromise, trendsPromise]);
    expect(exceptions.status()).toBe(200);
    expect(trends.status()).toBe(200);
    expect(calls.some((u) => u.includes(EXCEPTIONS_RPC))).toBe(true);
    expect(calls.some((u) => u.includes(TRENDS_RPC))).toBe(true);
  });

  test('renders all seven panels, none of them blank', async ({ page }) => {
    await openReports(page);

    // The four exception cards…
    for (const panel of ['Stalled work', 'Went backwards', 'Churning tasks', 'Fleet scorecard']) {
      await expect(page.getByRole('heading', { name: panel, level: 2 })).toBeVisible({ timeout: 15_000 });
    }
    // …the stalled card's two sections…
    await expect(page.getByRole('heading', { name: 'Claimed and silent', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Waiting unclaimed', level: 3 })).toBeVisible();

    // …and the three trend cards, each with its named chart image.
    for (const panel of ['Autonomy and rework', 'Created vs completed', 'Flow']) {
      await expect(page.getByRole('heading', { name: panel, level: 2, exact: true })).toBeVisible({ timeout: 15_000 });
    }
    for (const chart of ['Autonomy and rework', 'Created vs completed', 'Cumulative flow']) {
      await expect(page.getByRole('img', { name: chart })).toBeVisible({ timeout: 15_000 });
    }

    // The dashboard.spec idiom: a panel is either populated or says why it is
    // empty — never blank. Heading + subtitle is two lines; anything real
    // (rows, an empty-state sentence, a chart legend) adds a third.
    const panels = page.locator('section').filter({ has: page.getByRole('heading', { level: 2 }) });
    await expect(panels).toHaveCount(7);
    for (let i = 0; i < 7; i++) {
      const body = await panels.nth(i).innerText();
      expect(body.split('\n').filter((l) => l.trim()).length).toBeGreaterThan(2);
    }
  });

  test('Unassign frees a stalled claim end-to-end over the wire', async ({ page }) => {
    await openReports(page);

    const stalledPanel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Stalled work', level: 2 }) });
    await expect(stalledPanel).toBeVisible({ timeout: 15_000 });

    // The seed guarantees stalled rows (day-old claims, silent > 24h). If this
    // fails, the fixture is exhausted — re-run `bun run seed`.
    const unassignButtons = stalledPanel.getByRole('button', { name: /^Unassign / });
    await expect(unassignButtons.first()).toBeVisible({ timeout: 15_000 });

    // The row's identity, taken from the button's own accessible name — no
    // fixed index into the list, and exact enough that "Seed task #2" can
    // never be satisfied by "Seed task #20".
    const buttonName = (await unassignButtons.first().getAttribute('aria-label'))!;
    const taskTitle = buttonName.replace(/^Unassign /, '');

    await unassignButtons.first().click();

    // The ConfirmDialog names the task; confirming is what fires the RPC.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Unassign "${taskTitle}"?`)).toBeVisible();

    const unassignRequest = page.waitForRequest(
      (r: Request) => r.url().includes('TaskService/UnassignTask'),
      { timeout: 15_000 },
    );
    // The mutation's onSuccess invalidates ['reports'], so a fresh exceptions
    // read must follow the write.
    const refreshed = page.waitForResponse(
      (r) => r.url().includes(EXCEPTIONS_RPC) && r.status() === 200,
      { timeout: 15_000 },
    );
    await dialog.getByRole('button', { name: 'Unassign', exact: true }).click();

    // The wire flow, both legs: unassignTask was actually called…
    await unassignRequest;

    // …and the re-queried report no longer lists the claim.
    const body = await (await refreshed).json();
    const stillListed = (body.stalledClaims ?? []).some(
      (c: { taskTitle: string }) => c.taskTitle === taskTitle,
    );
    expect(stillListed).toBe(false);

    // And the row leaves the screen, not just the payload. `exact`, because
    // role-name matching is substring by default and "Unassign Seed task #2"
    // would otherwise still match a surviving "…#20" row.
    await expect(stalledPanel.getByRole('button', { name: buttonName, exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  test('the window selector re-queries both RPCs with windowDays 90', async ({ page }) => {
    await openReports(page);

    const ninetyDays = page.getByRole('button', { name: '90 days' });
    await expect(ninetyDays).toBeVisible({ timeout: 15_000 });

    const exceptions90 = page.waitForRequest(
      (r: Request) => r.url().includes(EXCEPTIONS_RPC) && r.postDataJSON()?.windowDays === 90,
      { timeout: 15_000 },
    );
    const trends90 = page.waitForRequest(
      (r: Request) => r.url().includes(TRENDS_RPC) && r.postDataJSON()?.windowDays === 90,
      { timeout: 15_000 },
    );
    await ninetyDays.click();

    await Promise.all([exceptions90, trends90]);
    await expect(ninetyDays).toHaveAttribute('aria-pressed', 'true');
  });

  test('the CFD task-type selector re-queries trends with that taskTypeId', async ({ page }) => {
    await openReports(page);

    const typeSelect = page.getByLabel('Task type');
    await expect(typeSelect).toBeVisible({ timeout: 15_000 });

    // The seed types 9 of 10 tasks and leaves the rest untyped, so the
    // selector always carries at least two real options — "Task (…)" and
    // "Untyped (…)". Switch away from the server's default pick: a same-value
    // select never fires React's onChange, so only a genuine change proves
    // the re-query.
    const current = await typeSelect.inputValue();
    const values: string[] = await typeSelect
      .locator('option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(values.length).toBeGreaterThan(1);
    const chosen = values.find((v) => v !== current)!;
    expect(chosen).toBeTruthy();

    const scopedTrends = page.waitForResponse(
      (r) =>
        r.url().includes(TRENDS_RPC) &&
        r.request().postDataJSON()?.taskTypeId === chosen &&
        r.status() === 200,
      { timeout: 15_000 },
    );
    await typeSelect.selectOption(chosen);
    await scopedTrends;

    // The chart re-renders under the new scope rather than blanking.
    await expect(page.getByRole('img', { name: 'Cumulative flow' })).toBeVisible({ timeout: 15_000 });
  });
});
