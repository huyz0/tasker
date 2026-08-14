# UI Testing Standards

To ensure a robust, accessible, and high-quality frontend, all UI development must adhere to the following test strategies. These practices augment our general `testing-standard.md` focusing purely on GUI delivery.

## 1. Accessibility (A11y) Testing

All pages and complex components MUST be validated for WCAG 2.1 AA compliance.
- **Tools**: `jest-axe`, wrapped by `src/test/a11y.ts`. It brings `axe-core`
  itself — do not add that as a direct dependency, `knip` fails the build on it.
- **Rule**: Every top-level page component in `apps/gui/src/pages/` MUST call
  `expectNoA11yViolations(container)` and prove 0 violations. This rule was
  aspirational until axe was actually installed; a rule nothing runs binds nothing.
- **Colour contrast is not tested here.** jsdom has no layout or paint, so axe
  cannot evaluate it and the rule is disabled in the helper. Contrast is measured
  instead by `node scripts/design-lint.mjs --only contrast`, which computes every
  token pair in both themes and fails below 4.5:1.
- **Manual Audits**: Use Axe DevTools during manual QA for keyboard navigation
  and for token combinations the static gate cannot see.

## 1b. Design Gates

Two gates run in `moon check` alongside the suite:
- `gui:design-lint` — raw hex, raw palette utilities, token contrast, and the
  statically checkable Web Interface Guidelines (`transition: all`, `outline-none`
  without a replacement, `<div onClick>`, images without `alt`, `...` for `…`).
- `/design-review` — the judgement the linter cannot make, against rendered
  screenshots at 375/768/1280 in light and dark. Not a CI gate; run it before
  shipping a screen.

## 2. Component Testing (Unit/Integration)

Testing individual UI primitives or features in isolation.
- **Tooling**: `@testing-library/react` and `@testing-library/jest-dom`.
- **Query Guidelines**: DO NOT test CSS classes, IDs, or raw DOM tags. 
  - ALWAYS test by user-accessible roles: `getByRole('button', { name: /submit/i })`.
  - NEVER test implementation details (e.g., checking if a state variable is updated—check if the *UI representation* of that variable is updated).
- **Mocks**: When testing React Query or Connect-RPC APIs, do not hit the live backend. Mock the generated clients to return stable fixtures.

## 3. Visual Regression & End-to-End

Unit tests cannot reliably verify that a CSS layout didn't break.
- **Strategy**: Define a Visual Testing scope for Critical Paths (e.g. Auth flow, Dashboard rendering).
- **Execution**: Future epics will integrate Playwright for true E2E rendering against a staging datastore, executing snapshot matches on full layouts.
- **Immediate Requirement**: Component authors should document all complex visual states (Empty, Loading, Error, Data) via Storybook, establishing the foundation for Chromatic/Playwright visual regression in the pipeline.

## 4. Setup Implementation
Our Vite/Vitest environment is configured with `jsdom` and `@testing-library/jest-dom` extensions automatically. Ensure any new test file uses `.test.tsx` and imports proper react utilities.
