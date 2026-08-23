import { test, expect, type Page } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * Addressable screens against the real backend (M28-T08).
 *
 * The milestone's headline claim is a claim about *two* browsers: a URL copied
 * out of one reopens the same thing for whoever pastes it, carrying its own
 * scope. No unit test can make that claim — jsdom has one document, one store
 * and no address bar — so exit criterion 1 is this file's first test and the
 * reason it exists.
 *
 * The other three cover what a browser proves and a component test cannot:
 * that a **hard reload** of a deep link keeps the deep link (the M23
 * regression, whose whole failure mode is that the store starts empty and the
 * URL fills it a tick later — a sequence only a real load performs), that a
 * screen's own navigational state comes back with it, and that a detail view
 * reached cold — with no history behind it — still shows a way out.
 *
 * Needs `bun run seed` (apps/backend) and a backend on :8080, exactly as
 * `reports.spec.ts` does; Playwright's own `webServer` starts the GUI.
 */

/** Unique per run, so a re-run never asserts on the previous run's rows. */
const RUN = Date.now().toString(36);
const TASK_A = `E2E addressable task ${RUN}`;

/** The `?org=`/`?project=` pair the URL is actually carrying (ADR-0025). */
function scopeOf(url: string): { org: string | null; project: string | null } {
  const params = new URL(url).searchParams;
  return { org: params.get('org'), project: params.get('project') };
}

/**
 * Points the project switcher at a named project and returns the name it
 * settled on.
 *
 * The name is read back off the chosen option rather than hardcoded, so the
 * caller asserts against whatever the seed actually produced instead of a
 * string that has to stay in sync with `scripts/seed.ts`. `reports.spec.ts`
 * carries a "Seed Project"-specific version of this; the generality is what
 * this file needs, since its whole point is pinning a project that is *not*
 * the one the switcher would pick on its own.
 */
async function selectProject(page: Page, search: string, option: RegExp): Promise<string> {
  await page.getByRole('button', { name: 'Active project' }).click();
  await page.getByRole('combobox', { name: 'Search active project' }).fill(search);
  const choice = page.getByRole('option', { name: option }).first();
  await expect(choice).toBeVisible({ timeout: 15_000 });
  const name = (await choice.textContent())!.trim();
  await choice.click();
  await expect(page.getByRole('button', { name: 'Active project' })).toContainText(name);
  return name;
}

/** The first card on the board, whatever the seed happens to have ordered first. */
function firstTaskCard(page: Page) {
  // The task title *is* the button (see comments.spec.ts on why the card
  // stopped being a `role="button"` div), and it lives in the card's h4.
  return page.getByRole('heading', { level: 4 }).getByRole('button').first();
}

test.describe('Addressable screens', () => {
  test('a task URL copied in one context reopens A’s project in a fresh context whose default is different', async ({
    page,
    browser,
    baseURL,
  }) => {
    // ---- Context A: pin a scope, put something in it, copy the URL ----
    await selectSeededOrg(page);

    // Deliberately *not* the project the switcher auto-selects. `bun run seed`
    // makes "Seed Project" the newest project in the seeded org, and the
    // switcher's auto-select takes `projects[0]` newest-first — so a URL
    // copied from Seed Project would prove nothing at all: a build with no
    // scope in the URL would land on exactly the same screen. The seed's
    // "Bulk Project …" rows are older, so pinning one makes A's scope
    // something only the URL can reproduce.
    const projectA = await selectProject(page, 'Bulk Project', /^Bulk Project /);

    // A bulk project is empty, which is the point: the task created here
    // exists in A's project and nowhere else, so seeing it in context B is
    // proof the *content* travelled and not merely a matching switcher label.
    await page.getByRole('button', { name: /^Add task to / }).first().click();
    await page.getByPlaceholder('Task title').fill(TASK_A);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: TASK_A }).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: TASK_A }).first().click();
    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible({ timeout: 15_000 });

    const urlFromA = page.url();
    const a = scopeOf(urlFromA);
    expect(urlFromA).toMatch(/\/tasks\/[^/?]+\?/);
    expect(a.org, 'a copied URL must carry the organization it was copied in').toBeTruthy();
    expect(a.project, 'a copied URL must carry the project it was copied in').toBeTruthy();

    // ---- Context B: a different last-used project, then paste A's URL ----
    // A genuinely separate browser context — its own cookie jar, its own
    // storage, its own module instances. Nothing of A's in-memory scope can
    // reach it; the only thing crossing is the URL string.
    const contextB = await browser.newContext({ baseURL });
    try {
      const pageB = await contextB.newPage();

      // Cold, scopeless load: the switcher's auto-select fills in whatever it
      // considers first. This is B's "last-used project" — and the adversary
      // the pasted URL has to beat.
      await pageB.goto('/tasks');
      await pageB.waitForURL(/[?&]org=/, { timeout: 20_000 });
      // The project auto-select runs on its own turn, once the org's first
      // page of projects has answered. An organization with no projects never
      // gets one, which is still a scope that differs from A's.
      await pageB.waitForURL(/[?&]project=/, { timeout: 10_000 }).catch(() => {});
      const b = scopeOf(pageB.url());

      expect(
        b.project,
        "context B's cold-load default must differ from A's project or this test proves nothing — " +
          're-run `bun run seed` so the backend has more than one project',
      ).not.toBe(a.project);

      await pageB.goto(urlFromA);

      // A's screen, in B's browser: the deep link is open…
      const detail = pageB.getByRole('dialog');
      await expect(pageB.getByRole('heading', { name: 'Task Details' })).toBeVisible({ timeout: 20_000 });
      // …it is A's task, not merely *a* task…
      await expect(detail).toContainText(TASK_A, { timeout: 20_000 });
      // …its trail names A's project, resolved from the id the URL carried
      // (the detail pane is `aria-modal`, so the switcher behind it is out of
      // the accessibility tree until it closes — this crumb is where the
      // resolved scope is readable while it is open)…
      await expect(detail.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(projectA, {
        timeout: 20_000,
      });
      // …and the auto-select did not overwrite the scope the URL arrived with.
      expect(scopeOf(pageB.url())).toEqual(a);

      // Close it, and the screen behind is A's too: A's organization, A's
      // project, and a task that exists in no other project.
      await pageB.keyboard.press('Escape');
      await expect(pageB.getByRole('button', { name: 'Active organization' })).toContainText('Seed Org', {
        timeout: 20_000,
      });
      await expect(pageB.getByRole('button', { name: 'Active project' })).toContainText(projectA, {
        timeout: 20_000,
      });
      await expect(pageB.getByRole('button', { name: TASK_A }).first()).toBeVisible({ timeout: 20_000 });
      expect(scopeOf(pageB.url())).toEqual(a);
    } finally {
      await contextB.close();
    }
  });

  test('a deep-linked task detail survives a hard reload', async ({ page }) => {
    // The M23 regression at the level no unit test reaches. Reloading a task
    // URL used to drop you back to the board, because the scope-change effect
    // could not tell "the store just hydrated from empty" from "the user
    // switched project". A real reload is the only thing that performs that
    // exact sequence — mount with an empty store, then fill it a tick later.
    await selectSeededOrg(page);
    await selectProject(page, 'Seed Project', /^Seed Project$/);

    const card = firstTaskCard(page);
    await expect(card).toBeVisible({ timeout: 30_000 });
    const title = (await card.textContent())!.trim();
    await card.click();

    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible({ timeout: 15_000 });
    const url = page.url();
    expect(url).toMatch(/\/tasks\/[^/?]+\?/);
    expect(scopeOf(url).project, 'the task URL must carry its project').toBeTruthy();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible({ timeout: 20_000 });
    // The same task, not merely *a* detail pane — and at the same URL, so
    // nothing silently redirected to the list and back. Asserted inside the
    // pane: it is `aria-modal`, so the card behind it is out of the
    // accessibility tree for as long as it is open.
    await expect(page.getByRole('dialog')).toContainText(title, { timeout: 20_000 });
    expect(page.url()).toBe(url);
  });

  test("Organizations' ?section= survives a reload, scope included", async ({ page }) => {
    // Of the four screens M28-T05 put in the URL, this is the one whose state
    // a browser can assert *robustly*: its sections are a real Radix
    // `role="tab"` list, so "which one is open" is readable from the
    // accessibility tree via `aria-selected` rather than from a class name,
    // and all three triggers render regardless of what is in the database.
    // Bin's tab is covered below on its panel content instead (its tabs are
    // plain buttons with no selected state in the tree); Memory's `?scope=`
    // is not covered here because `scripts/seed.ts` writes no beliefs, so the
    // screen has nothing to distinguish one tier from the other; Task Types'
    // `:typeId` gets its own test at the bottom of this file.
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Organizations' }).click();
    await expect(page.getByRole('heading', { name: 'Organizations & Settings', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('tab', { name: 'Audit Trail' }).click();
    await expect(page).toHaveURL(/[?&]section=audit/);
    const url = page.url();
    expect(scopeOf(url).org, 'moving between sections must not drop the scope').toBeTruthy();

    await page.reload();

    await expect(page.getByRole('tab', { name: 'Audit Trail' })).toHaveAttribute('aria-selected', 'true', {
      timeout: 20_000,
    });
    await expect(page.getByRole('tabpanel')).toBeVisible();
    // The section and the organization come back; the project may be *added*
    // on the way (the switcher's auto-select fills a scope the URL did not
    // state, with `replace: true`), which is the feature working, not drift —
    // so this compares the parameters that were set rather than the whole
    // string.
    const before = new URL(url).searchParams;
    const after = new URL(page.url()).searchParams;
    expect(after.get('section')).toBe(before.get('section'));
    expect(after.get('org')).toBe(before.get('org'));
  });

  test("Bin's ?tab= survives a reload", async ({ page }) => {
    await selectSeededOrg(page);
    await selectProject(page, 'Seed Project', /^Seed Project$/);
    await page.getByRole('link', { name: 'Bin' }).click();
    await expect(page.getByRole('heading', { name: 'Bin', level: 1 })).toBeVisible({ timeout: 15_000 });

    // Folders rather than Tasks: the seed archives nothing, and no spec in
    // this suite archives a *folder* (core-journey archives a task), so this
    // panel's empty state is deterministic — which is what makes "the Folders
    // panel came back" assertable without reading a class name off the tab.
    await page.getByRole('button', { name: 'Folders', exact: true }).click();
    await expect(page).toHaveURL(/[?&]tab=folders/);
    const url = page.url();

    await page.reload();

    await expect(page.getByText('No archived folders in this project.')).toBeVisible({ timeout: 20_000 });
    expect(page.url()).toBe(url);
  });

  test('a task reached cold by deep link shows a trail out, and its ancestors keep the scope', async ({ page }) => {
    await selectSeededOrg(page);
    const projectName = await selectProject(page, 'Seed Project', /^Seed Project$/);

    const card = firstTaskCard(page);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page.getByRole('heading', { name: 'Task Details' })).toBeVisible({ timeout: 15_000 });

    // Reload first: a trail matters most when there is no history behind the
    // view, which is the state a pasted link arrives in and the state a
    // click-through never reaches.
    await page.reload();

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toBeVisible({ timeout: 20_000 });
    await expect(crumbs).toContainText(projectName, { timeout: 20_000 });

    const links = crumbs.getByRole('link');
    const count = await links.count();
    expect(count, 'a trail with no linked ancestor is not a way out').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute('href');
      const label = (await link.textContent())?.trim();
      // Following a crumb must not silently change which project you are in —
      // the exact failure ADR-0025 exists to remove.
      expect(href, `breadcrumb link "${label}" dropped the organization`).toContain('org=');
      expect(href, `breadcrumb link "${label}" dropped the project`).toContain('project=');
    }
    // The trail ends in the entity, marked as the current page rather than
    // offering a link to where you already are.
    await expect(crumbs.locator('[aria-current="page"]')).toBeVisible();

    // And an ancestor is a *working* link, not a styled span.
    await links.first().click();
    await expect(page).toHaveURL(/[?&]project=/);
  });

  test('a deep-linked task type keeps its selection across a reload and shows a trail back', async ({ page }) => {
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Task Types' }).click();

    // The type rail — identified by the form it holds, not by position: the
    // shell's own sidebar is also an `<aside>`, and taking the first one on the
    // page opens the organization switcher instead of a task type.
    //
    // Whichever type the org lists first is the one under test, read by name
    // off the element rather than hardcoded, so no assertion here depends on
    // the seed's ordering or on the type being called "Task".
    const rail = page.locator('aside').filter({ has: page.getByLabel('New task type name') });
    const typeButton = rail.getByRole('button').filter({ hasNotText: 'Add type' }).first();
    await expect(typeButton).toBeVisible({ timeout: 20_000 });
    const typeName = (await typeButton.textContent())!.trim();

    await typeButton.click();
    await expect(page).toHaveURL(/\/task-types\/[^/?]+\?/);
    const url = page.url();

    await page.reload();

    // The selection is the route now (M28-T05), so a reload reopens the same
    // type instead of the "choose a task type" empty state.
    await expect(page.getByRole('heading', { name: typeName, level: 2 })).toBeVisible({ timeout: 20_000 });
    // The path — which is where the selection now lives — and the organization
    // the type belongs to. Not the whole string: task types are org-scoped, so
    // the link that reached here carried no project, and the reload's
    // auto-select fills one in (with `replace: true`). That is the switcher
    // working, not the deep link drifting.
    expect(new URL(page.url()).pathname).toBe(new URL(url).pathname);
    expect(new URL(page.url()).searchParams.get('org')).toBe(new URL(url).searchParams.get('org'));

    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toBeVisible();
    const back = crumbs.getByRole('link', { name: 'Task Types' });
    await expect(back).toHaveAttribute('href', /[?&]org=/);
    await back.click();
    await expect(page).toHaveURL(/\/task-types\?/);
  });
});
