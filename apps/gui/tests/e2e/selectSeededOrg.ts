import { expect, type Page } from '@playwright/test';

/**
 * Explicitly selects `bun run seed`'s org via the switcher, instead of
 * relying on whichever org the app lands on by default.
 *
 * The switcher auto-selects `orgs[0]` on a fresh load, and `listOrgs`
 * defaults to newest-first when no explicit sort is requested
 * (`query-builder.ts`'s `executePaginatedQuery`) — so the moment any other
 * spec in this suite creates its own org (`journeys/core-journey.spec.ts`
 * does), that new org becomes `orgs[0]` for every subsequent page load
 * against this same shared dev backend, and a spec that just does
 * `page.goto('/tasks')` and assumes the seeded project's tasks are there
 * lands on someone else's empty org instead. Found the hard way: this used
 * to be exactly that assumption, and it passed only by accident of test
 * execution order.
 *
 * Matches on the "Seed Org " prefix `apps/backend/scripts/seed.ts` gives its
 * org (`Seed Org ${runId}` - the suffix is random per seed run, so this
 * can't match on an exact name) rather than a fixed id, since the id isn't
 * known at spec-write time either.
 */
export async function selectSeededOrg(page: Page): Promise<void> {
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Active organization' }).click();
  await page.getByRole('combobox', { name: 'Search active organization' }).fill('Seed Org');
  await page.getByRole('option', { name: /^Seed Org /i }).first().click();
  await expect(page.getByRole('button', { name: 'Active organization' })).toContainText('Seed Org');
}
