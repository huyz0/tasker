import { axe, toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

expect.extend(toHaveNoViolations);

/**
 * `ui-testing-standard.md` §1 has required this of every top-level page since it
 * was written; axe was never actually installed, so the rule bound nothing.
 *
 * jsdom cannot evaluate colour contrast — it has no layout or paint — so that
 * rule is disabled here and covered instead by
 * `scripts/design-lint.mjs --only contrast`, which measures the token pairs
 * directly. Everything else axe checks (roles, names, labels, landmarks,
 * heading order, ARIA validity) is real in jsdom.
 */
export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results).toHaveNoViolations();
}
