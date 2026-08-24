import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * The notification bell against the real backend (M29-T08).
 *
 * The component tests prove every state renders from a mocked wire shape, and
 * the handler tests prove one user cannot read another's rows. What only a
 * browser can prove is the part the milestone actually claims: that a
 * notification written by the backend reaches the bell, that clicking it lands
 * on the right task *in the right project*, and that "read" is a fact about
 * the database rather than about this tab — which needs a real reload, since
 * jsdom has one document and no address bar.
 *
 * Needs `bun run seed` (apps/backend) and a backend on :8080, exactly as
 * `reports.spec.ts` does; Playwright's own `webServer` starts the GUI. The
 * seed writes three stalled-claim notifications for the GUI dev user through
 * the same registry the hourly sweep uses — a spec cannot wait an hour for
 * the real sweep, and triggering it would be testing the sweep rather than
 * the bell.
 *
 * Locally, run with `--workers=1`: the default fan-out crashes the renderer
 * on this project's dynamic imports (M28-T04 recorded the same).
 *
 * **This file consumes its fixture**, the same contract `reports.spec.ts`
 * carries for its Unassign test: the last test marks every notification read,
 * so a second run against the same database finds no unread ones and the
 * badge tests fail. Re-seed to restore it. CI seeds fresh before the job, so
 * this only bites a local re-run — and it bites loudly rather than silently
 * passing on stale state, which is the right way round.
 */

/**
 * The bell is mounted in *both* header regions (M29-T07) — the mobile header
 * and the desktop sidebar — and exactly one of them is visible at any
 * viewport. `.first()` is therefore wrong: at the default desktop width it
 * resolves to the `md:hidden` copy and every assertion waits on an element
 * that will never be shown. Filter to what is actually on screen.
 */
function bell(page: import('@playwright/test').Page) {
  return page.getByTestId('notification-bell').locator('visible=true');
}

function badge(page: import('@playwright/test').Page) {
  return page.getByTestId('notification-badge').locator('visible=true');
}

test.describe('notification bell', () => {
  test('shows a badge for what the backend wrote, and lists it', async ({ page }) => {
    await selectSeededOrg(page);

    // The seed writes three. The badge asserts on presence rather than an
    // exact number: another spec in this shared backend may have marked one
    // read, and pinning "3" would make this fail for a reason that has
    // nothing to do with the bell.
    await expect(badge(page)).toBeVisible({ timeout: 15_000 });

    await bell(page).click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();

    // Rendered server-side by notificationRegistry.ts — the body text is the
    // renderer's, not the component's.
    await expect(panel.getByText(/silent for \d+ hours/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('opens the task it names, carrying its own scope', async ({ page }) => {
    await selectSeededOrg(page);
    await bell(page).click();

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await panel.getByRole('button').filter({ hasText: /silent for/ }).first().click();

    await expect(page).toHaveURL(/\/tasks\/[^/?]+\?/, { timeout: 15_000 });

    // ADR-0025. Without these the link reopens under whatever project the
    // reader had selected, which is the M28 bug this inherits the fix for.
    const params = new URL(page.url()).searchParams;
    expect(params.get('org')).toBeTruthy();
    expect(params.get('project')).toBeTruthy();
  });

  test('read state survives a hard reload, because it lives in the database', async ({ page }) => {
    await selectSeededOrg(page);
    await bell(page).click();

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: /mark all read/i })).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('button', { name: /mark all read/i }).click();

    // Gone in this tab...
    await expect(badge(page)).toHaveCount(0, { timeout: 15_000 });

    // ...and still gone in a new document. A store-only implementation passes
    // the assertion above and fails this one, which is the whole point of
    // spending a browser on it.
    await page.reload();
    await expect(bell(page)).toBeVisible({ timeout: 15_000 });
    await expect(badge(page)).toHaveCount(0);
  });
});
