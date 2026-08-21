import { test, expect, type Page } from '@playwright/test';

/**
 * The journey the milestone names, end to end, through the real UI (M12-T05).
 *
 * Sign in → organization → template → project → task → comment → search →
 * archive. Every step is a click or a keystroke a person would make; nothing
 * reaches past the interface into an RPC. That is the point — each of these
 * features has unit tests already, and what none of them prove is that the
 * steps *connect*: that the organization just created is the one the switcher
 * selects, that the project lands in it, that the task lands in the project the
 * switcher is pointing at, and that search finds it afterwards.
 *
 * **Determinism** (M12-T04) comes from unique names rather than a restored
 * snapshot. Every run creates `E2E … <run id>` entities and asserts only on
 * those, so the suite is order-independent and repeatable against a database
 * that already has data in it — which is the state any developer's local
 * backend is actually in. A snapshot would be stricter and would also mean
 * every run destroying whatever that developer was in the middle of.
 *
 * Serial, because it is one journey: each step depends on what the previous
 * one created, and a parallel run would assert against a project that does not
 * exist yet.
 */

const RUN = Date.now().toString(36);
const ORG_NAME = `E2E Org ${RUN}`;
const TEMPLATE_NAME = `E2E Template ${RUN}`;
const PROJECT_NAME = `E2E Project ${RUN}`;
const TASK_TITLE = `E2E task ${RUN}`;
const COMMENT_BODY = `A comment from run ${RUN}`;

/**
 * Navigates and waits for the shell rather than a fixed timeout.
 *
 * Every screen is behind `React.lazy`, so the first paint after a navigation is
 * a suspense fallback and an immediate assertion races it.
 */
async function goto(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible();
}

/** Picks an entry in one of the two combobox switchers in the sidebar. */
async function chooseInSwitcher(page: Page, label: string, optionName: string) {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('option', { name: optionName }).first().click();
  await expect(page.getByRole('button', { name: label })).toContainText(optionName);
}

test.describe.configure({ mode: 'serial' });

test.describe('the core journey', () => {
  test('signs in and reaches the authenticated shell', async ({ page }) => {
    // A development run bootstraps a session, so arriving already signed in
    // *is* the pass condition — what matters is that the app is behind auth and
    // that the shell rendered, not which credential got us here. Against a
    // deployment with no dev session this lands on /login and signs in for
    // real, rather than pretending to have typed a password when it did not.
    await page.goto('/');

    const signIn = page.getByRole('button', { name: 'Sign in' });
    if (await signIn.isVisible().catch(() => false)) {
      await page.getByLabel('Username').fill(`e2e-${RUN}`);
      await page.getByLabel('Password').fill('a-long-enough-password');
      await signIn.click();
    }

    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  });

  test('creates an organization', async ({ page }) => {
    await goto(page, '/organizations');

    await page.getByRole('button', { name: 'New Organization' }).click();
    await page.getByPlaceholder('Organization name').fill(ORG_NAME);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByText(ORG_NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test('creates a project in it, from a template it also creates', async ({ page }) => {
    await goto(page, '/projects');

    // The switcher decides which organization the project is created in, so it
    // has to be pointed at the new one first. A project created against the
    // previously-selected org is exactly the steps-do-not-connect failure this
    // journey exists to catch.
    await chooseInSwitcher(page, 'Active organization', ORG_NAME);

    // A fresh organization has no templates, and a project cannot be created
    // without one — so the journey creates that too rather than assuming a
    // fixture left one lying around. The form is behind a toggle.
    await page.getByRole('button', { name: '+ New Template' }).click();
    await page.getByPlaceholder('Template name').fill(TEMPLATE_NAME);
    await page.getByRole('button', { name: 'Create Template' }).click();
    await expect(page.getByText(TEMPLATE_NAME).first()).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('New project name').fill(PROJECT_NAME);
    // The card for the template just created, identified by containing *both*
    // its heading and the button — filtering on the heading alone matches the
    // inner wrapper that holds the heading and "Edit" and no "Use Template" at
    // all. In a shared database the first card on the page belongs to someone
    // else, so `.first()` would create the project from the wrong template.
    const templateCard = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: TEMPLATE_NAME }) })
      .filter({ has: page.getByRole('button', { name: 'Use Template' }) })
      .last();
    await templateCard.getByRole('button', { name: 'Use Template' }).click();

    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test('creates a task in that project and comments on it', async ({ page }) => {
    await goto(page, '/tasks');
    await chooseInSwitcher(page, 'Active organization', ORG_NAME);
    await chooseInSwitcher(page, 'Active project', PROJECT_NAME);

    // The board renders a column per status; the first "Add task to …" button
    // is the first column, whatever the template happens to call it.
    await page.getByRole('button', { name: /^Add task to / }).first().click();
    await page.getByPlaceholder('Task title').fill(TASK_TITLE);
    await page.keyboard.press('Enter');

    const card = page.getByText(TASK_TITLE).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    // The composer is the rich markdown editor (M23), not a textarea — its
    // placeholder is a rendered paragraph rather than a `placeholder`
    // attribute, so it is addressed by its accessible name and typed into
    // rather than filled.
    const composer = page.getByRole('textbox', { name: 'editable markdown' }).first();
    await expect(composer).toBeVisible({ timeout: 10_000 });
    await composer.click();
    await composer.pressSequentially(COMMENT_BODY);
    await page.getByRole('button', { name: 'Post Comment' }).click();

    await expect(page.getByText(COMMENT_BODY).first()).toBeVisible({ timeout: 15_000 });
  });

  test('finds the task through search', async ({ page }) => {
    // The step that proves the chain: the task reached the database, the search
    // index saw it, and the result is reachable from anywhere in the app.
    await goto(page, '/');

    await page.getByRole('button', { name: /search/i }).first().click();
    const box = page.getByPlaceholder(/search/i).first();
    await expect(box).toBeVisible({ timeout: 10_000 });
    await box.fill(TASK_TITLE);

    await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 15_000 });
  });

  test('archives the task, and it leaves the board', async ({ page }) => {
    await goto(page, '/tasks');
    await chooseInSwitcher(page, 'Active organization', ORG_NAME);
    await chooseInSwitcher(page, 'Active project', PROJECT_NAME);

    const card = page.getByText(TASK_TITLE).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    // The confirmation says "Move to bin", not "Delete" — archiving here is
    // reversible, and the dialog says so. Matching on /delete/i would have hit
    // the button *behind* the dialog and left the task exactly where it was.
    await page.getByRole('button', { name: 'Move to bin' }).click();

    // Gone from the board, not merely hidden behind a dialog that is still open.
    await expect(page.getByText(TASK_TITLE)).toHaveCount(0, { timeout: 15_000 });
  });
});
