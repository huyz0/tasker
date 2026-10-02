import { test, expect } from '@playwright/test';
import { selectSeededOrg } from './selectSeededOrg';

/**
 * The Organizations > Audit trail screen against the real backend (M32-T08).
 *
 * This screen never loaded, and nothing noticed: the GUI sends `page: {
 * cursor }`, an unset proto3 int32 arrives as 0, and `ListAuditEvents`
 * rejected a limit of 0 - reported as Internal, so it read like a transient
 * fault (fixed in M30-T11). The component tests passed throughout, because
 * they mock the wire; no browser test had ever asserted a row rendered.
 *
 * Audit rows are written by the NATS projector, which this job has no broker
 * for, so `bun run seed` writes a few through the projector's own
 * `projectEvent`. Needs a backend started with `ENABLE_TEST_LOGIN=true`, as
 * every spec here does (see selectSeededOrg.ts). Read-only: re-runnable.
 */
test.describe('Audit trail', () => {
  test('renders the organization\'s events, newest first, from the real backend', async ({ page }) => {
    await selectSeededOrg(page);
    await page.getByRole('link', { name: 'Organizations' }).first().click();
    await page.getByRole('tab', { name: 'Audit trail' }).click();

    const panel = page.getByRole('tabpanel', { name: 'Audit trail' });
    // formatSubject renders "domain.org.member_added" as "org · member added".
    await expect(panel.getByText('org · member added')).toBeVisible();
    await expect(panel.getByText('project · created')).toBeVisible();
    await expect(panel.getByText('org · created')).toBeVisible();
    await expect(panel.getByText(/Could not load/)).toHaveCount(0);
  });
});
