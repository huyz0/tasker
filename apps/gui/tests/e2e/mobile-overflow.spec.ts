import { test, expect } from '@playwright/test';

/**
 * The assembled app must not scroll sideways on a phone.
 *
 * `scripts/mobile-overflow.mjs` already checks this, but it renders *stories*
 * out of `storybook-static` — it measures components in isolation and never
 * sees the shell they are mounted in. A UX review found the gap the hard way:
 * the mobile header's search trigger, theme toggle and avatar together needed
 * 259px of the 214px left beside the brand, so every route's document measured
 * 420px wide at a 375px viewport. Six routes shipped scrolling sideways past a
 * green gate, because no story contains `AppShell`.
 *
 * This is the route-level companion, and it lives in the e2e suite rather than
 * in that script because it needs the real shell — a booted backend, a seeded
 * database and the router — which the e2e job already provides and the
 * Storybook build deliberately does not.
 *
 * A deliberate horizontal scroller is not a violation: the Tasks board's
 * `overflow-x-auto` columns are meant to scroll sideways on a phone. This
 * asserts on the *document*, which must never scroll, not on inner elements
 * that own a scrolling ancestor.
 */

// 375px is the width `ui-ux-standard.md` §3 names as the one that must be
// right. Height is incidental — overflow here is horizontal by definition.
const PHONE = { width: 375, height: 812 };

const ROUTES = ['/', '/tasks', '/projects', '/artifacts', '/agents', '/bin', '/organizations', '/settings'];

test.describe('mobile overflow (assembled app, not stories)', () => {
  test.use({ viewport: PHONE });

  for (const path of ROUTES) {
    test(`${path} does not scroll sideways at 375px`, async ({ page }) => {
      await page.goto(path);

      // Wait for the shell itself rather than route content: every route
      // renders the header, and it is the header that regressed.
      await expect(page.getByRole('button', { name: /Toggle Sidebar/i })).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // Report the overrun in the message — "expected 420 to be <= 375" alone
      // does not say which way the page is broken or by how much.
      expect(
        scrollWidth,
        `${path} overflows by ${scrollWidth - clientWidth}px at ${PHONE.width}px ` +
          `(document scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`,
      ).toBeLessThanOrEqual(clientWidth);
    });
  }
});
