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
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.title.includes('touch targets') && testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({ path: testInfo.outputPath('report-capture-failure.png'), fullPage: true });
    }
  });

  test('section locations preserve scope, window, history and keyboard focus', async ({ page }) => {
    await openReports(page);
    const original = new URL(page.url());
    await page.getByRole('button', { name: '90 days', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Report sections' });
    const trends = navigation.getByRole('link', { name: 'Trends', exact: true });
    await expect(trends).toBeVisible({ timeout: 5_000 });
    await trends.focus();
    await trends.press('Enter');
    await expect(page.getByRole('heading', { name: 'Reports — Trends', exact: true })).toBeFocused();
    await expect(page.getByRole('img', { name: 'Cumulative flow', exact: true })).toBeVisible();
    const type = page.getByLabel('Task type');
    const selected = await type.inputValue();
    await navigation.getByRole('link', { name: 'Spend', exact: true }).click();
    await navigation.getByRole('link', { name: 'Trends', exact: true }).click();
    await expect(type).toHaveValue(selected);
    await expect(page.getByRole('heading', { name: 'Reports — Trends', exact: true })).toBeFocused();
    const seven = page.getByRole('button', { name: '7 days', exact: true });
    await seven.click();
    await expect(seven).toBeFocused();
    await expect(page).toHaveURL(/days=7.*#trends$/);
    const scoped = new URL(page.url());
    expect(scoped.searchParams.get('org')).toBe(original.searchParams.get('org'));
    expect(scoped.searchParams.get('project')).toBe(original.searchParams.get('project'));
    await page.goBack();
    await expect(page).toHaveURL(/days=90.*#trends$/);
    await expect(page.getByRole('heading', { name: 'Reports — Trends', exact: true })).toBeVisible();
    await navigation.getByRole('link', { name: 'Spend', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Reports — Spend', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Spend', exact: true })).toHaveAttribute('aria-current', 'location');
  });

  test('report touch targets and text reflow stay usable', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    // Presentation-only synthetic spend: real scoped RPC/history behavior is
    // exercised separately above and in saved-views.spec.ts.
    await page.route('**/GetUsageReport', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        totals: { costMicros: '2500000000', inputTokens: '12000', outputTokens: '4000', reports: '2' },
        byDay: [
          { key: '2026-11-01', costMicros: '0', inputTokens: '0', outputTokens: '0', reports: '0' },
          { key: '2026-11-02', costMicros: '2500000000', inputTokens: '12000', outputTokens: '4000', reports: '2' },
        ],
        byAgent: [{ key: 'layout-worker', label: 'Release verification worker with a long display name', costMicros: '2500000000', inputTokens: '12000', outputTokens: '4000', reports: '2' }],
      }),
    }));
    await openReports(page);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    await page.setViewportSize({ width: 375, height: 900 });
    await expect(page.getByRole('heading', { name: 'Reports', level: 1, exact: true })).toBeInViewport();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const fontSize of ['100%', '200%']) {
          await page.evaluate(value => { document.documentElement.style.fontSize = value; }, fontSize);
          const controls = [
            ...await page.getByRole('group', { name: 'Report window' }).getByRole('button').all(),
            ...await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link').all(),
            page.getByRole('button', { name: 'Saved views', exact: true }),
          ];
          for (const control of controls) {
            const box = await control.boundingBox();
            expect(box, await control.innerText()).not.toBeNull();
            expect(box!.height, await control.innerText()).toBeGreaterThanOrEqual(44);
            expect(box!.width, await control.innerText()).toBeGreaterThanOrEqual(44);
            expect(box!.x, await control.innerText()).toBeGreaterThanOrEqual(0);
            expect(box!.x + box!.width, await control.innerText()).toBeLessThanOrEqual(width);
          }
          const initial = await page.evaluate(() => ({
            viewport: innerWidth, document: document.documentElement.scrollWidth,
            outliers: [...document.querySelectorAll('body *')].filter(element => {
              const box = element.getBoundingClientRect();
              return box.width > 1 && box.height > 0 && box.right > innerWidth && !element.closest('.overflow-x-auto');
            }).slice(0, 20).map(element => ({ tag: element.tagName, className: element.getAttribute('class'), right: element.getBoundingClientRect().right })),
          }));
          expect(initial.document, JSON.stringify({ theme, width, fontSize, ...initial })).toBeLessThanOrEqual(width);
          for (const section of ['Trends', 'Spend', 'Exceptions']) {
            await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link', { name: section, exact: true }).click();
            const title = section === 'Exceptions' ? 'Reports' : `Reports — ${section}`;
            await expect(page.getByRole('heading', { name: title, level: 1, exact: true })).toBeFocused();
            await expect(page.getByRole('region', { name: section, exact: true })).toBeVisible();
            if (section === 'Trends') await expect(page.getByLabel('Task type')).toBeVisible();
            if (section === 'Spend') await expect(page.getByRole('img', { name: 'Daily spend over 2 days' })).toBeVisible();
            if (section === 'Exceptions') await expect(page.getByRole('heading', { name: 'Stalled work', level: 2 })).toBeVisible();
            const reflow = await page.evaluate(() => ({
              viewport: innerWidth, document: document.documentElement.scrollWidth,
              outliers: [...document.querySelectorAll('main *')].filter(element => {
                const box = element.getBoundingClientRect();
                return box.width > 1 && box.right > innerWidth && getComputedStyle(element).visibility !== 'hidden';
              }).slice(0, 12).map(element => ({ tag: element.tagName, className: element.getAttribute('class'), width: element.getBoundingClientRect().width })),
            }));
            expect(reflow.document, JSON.stringify({ theme, width, fontSize, section, ...reflow })).toBeLessThanOrEqual(width);
            if (section === 'Trends') {
              const select = page.getByLabel('Task type');
              const box = await select.boundingBox();
              expect(box!.height).toBeGreaterThanOrEqual(44);
              expect(box!.x + box!.width).toBeLessThanOrEqual(width);
            }
            if (section === 'Exceptions') {
              const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Churning tasks', level: 2, exact: true }) });
              const titleBoxes = await panel.getByRole('heading', { name: 'Churning tasks', level: 2, exact: true }).evaluate(element => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return [...range.getClientRects()].map(box => ({ x: box.x, y: box.y, width: box.width, height: box.height }));
              });
              const actionBox = await panel.getByRole('link', { name: 'View handoff notes', exact: true }).boundingBox();
              const overlaps = titleBoxes.some(titleBox =>
                Math.min(titleBox.x + titleBox.width, actionBox!.x + actionBox!.width) > Math.max(titleBox.x, actionBox!.x)
                && Math.min(titleBox.y + titleBox.height, actionBox!.y + actionBox!.height) > Math.max(titleBox.y, actionBox!.y));
              expect(overlaps, JSON.stringify({ theme, width, fontSize, titleBoxes, actionBox })).toBe(false);
            }
            if (section === 'Spend') {
              await expect(page.getByRole('table', { name: 'Daily spend data' })).toContainText('2026-11-02');
              const table = page.getByRole('region', { name: 'Agent spend table', exact: true });
              if (await table.evaluate(element => element.scrollWidth > element.clientWidth)) {
                await table.focus();
                await table.press('ArrowRight');
                await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
                await table.evaluate(element => { element.scrollLeft = 0; });
              }
            }
            if ((width === 375 || width === 1280) && fontSize === '100%' || width === 375 && fontSize === '200%') {
              const name = `report-capture-${section.toLowerCase()}-${theme}-${width}-${fontSize.replace('%', '')}.png`;
              const capture = testInfo.outputPath(name);
              await page.evaluate(() => window.scrollTo(0, 0));
              await page.screenshot({ path: capture, fullPage: true });
              await testInfo.attach(name, { path: capture, contentType: 'image/png' });
            }
          }
        }
      }
    }
  });

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
    // `(\?|$)`, not `$`: since M28-T04 every shell link carries the active
    // scope, so following one lands on `/reports?org=…&project=…`. The path is
    // what this assertion is about; the query string is the scope working.
    await expect(page).toHaveURL(/\/reports(\?|$)/);
    await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeVisible({ timeout: 15_000 });

    // Both RPCs answered 200 — reached AND authorized, not merely attempted.
    const [exceptions, trends] = await Promise.all([exceptionsPromise, trendsPromise]);
    expect(exceptions.status()).toBe(200);
    expect(trends.status()).toBe(200);
    expect(calls.some((u) => u.includes(EXCEPTIONS_RPC))).toBe(true);
    expect(calls.some((u) => u.includes(TRENDS_RPC))).toBe(true);
  });

  test('renders all eight panels, none of them blank', async ({ page }) => {
    await openReports(page);

    // The four exception cards…
    for (const panel of ['Stalled work', 'Went backwards', 'Churning tasks', 'Fleet scorecard']) {
      await expect(page.getByRole('heading', { name: panel, level: 2 })).toBeVisible({ timeout: 15_000 });
    }
    // …the stalled card's two sections…
    await expect(page.getByRole('heading', { name: 'Claimed and silent', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Waiting unclaimed', level: 3 })).toBeVisible();

    await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link', { name: 'Spend', exact: true }).click();

    // …agent spend (M40), which says why it is empty when nothing was reported…
    await expect(page.getByRole('heading', { name: 'Agent spend', level: 2 })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link', { name: 'Trends', exact: true }).click();

    // …and the three trend cards, each with its named chart image.
    for (const panel of ['Autonomy and rework', 'Created vs completed', 'Flow']) {
      await expect(page.getByRole('heading', { name: panel, level: 2, exact: true })).toBeVisible({ timeout: 15_000 });
    }
    for (const chart of ['Autonomy and rework', 'Created vs completed', 'Cumulative flow']) {
      await expect(page.getByRole('img', { name: chart })).toBeVisible({ timeout: 15_000 });
    }

    for (const section of ['Exceptions', 'Trends', 'Spend']) {
      await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link', { name: section, exact: true }).click();
      const panels = page.locator('section:visible').filter({ has: page.getByRole('heading', { level: 2 }) });
      await expect(panels).toHaveCount(section === 'Exceptions' ? 4 : section === 'Trends' ? 3 : 1);
      for (const panel of await panels.all()) {
        expect((await panel.innerText()).split('\n').filter((line) => line.trim()).length).toBeGreaterThan(2);
      }
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

    await page.getByRole('navigation', { name: 'Report sections' }).getByRole('link', { name: 'Trends', exact: true }).click();
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
