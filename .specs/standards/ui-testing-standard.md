# UI Testing Standards

To ensure a robust, accessible, and high-quality frontend, all UI development must adhere to the following test strategies. These practices augment our general `testing-standard.md` focusing purely on GUI delivery.

## 1. Accessibility (A11y) Testing

All pages and complex components MUST be validated for WCAG 2.1 AA compliance.
- **Tools**: We use `axe-core` (or `@axe-core/react`) for automated accessibility tests.
- **Rule**: Every top-level page component in `apps/gui/src/pages/` must include a vitest/testing-library block that runs `jest-axe` against the rendered DOM to prove 0 accessibility violations.
- **Manual Audits**: Use the browser's built-in Axe DevTools extension during manual QA to test keyboard nav and color contrast for newly introduced token combinations.

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
