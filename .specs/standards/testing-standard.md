# Testing & QA Standards

## 1. Test-Driven Development (TDD)

- **Workflow**: Red-Green-Refactor.
  1. **Red**: Write failing test first.
  2. **Green**: Minimum code to pass.
  3. **Refactor**: Clean up and optimize.
- **Result**: Enforces decoupled, cohesive design boundaries prioritizing public
  API consumption.

## 2. Test Coverage Goals

- **Enforced gate: 95%** lines, branches, functions and statements
  (`apps/gui/vitest.config.ts:16-20`). This is a build failure, not a target —
  a change that drops coverage below it does not merge.
- Aim above the gate rather than at it. A module sitting at exactly 95% fails
  the moment anyone adds an untested line.
- **Agent Rule**: run the suite locally before calling a task done —
  `moon run <project>:test`, or `/local-ci-run` for the whole pipeline. Never
  `npx`, `npm`, `yarn` or `pnpm`; this repository is bun-only and `AGENTS.md`
  forbids the others outright.

## 3. Focus Areas

- **Unit (Vitest)**: Fast, single-purpose testing. Bulk of the coverage.
- **Integration**: Boundary tests — handlers against a real SQLite database;
  React against the real generated ConnectRPC clients and transport, with only
  the network intercepted by **MSW** (M12-T01). Register responses with
  `mockRpc(Service, 'Method', json)` from `apps/gui/src/test/mockRpc.ts`; the
  shared server runs with `onUnhandledRequest: 'error'`, so an RPC a test did
  not expect fails it. Do not mock `createClient` or a service object — a stub
  that never serializes cannot catch contract drift.
- **E2E (Playwright)**: Critical 'Happy Paths' only. Do not rely heavily on E2E
  for percentage goals due to runtime costs.

## 4. Co-location

- **Rule**: Tests reside adjacent to code. `CreateTask.ts` lives next to
  `CreateTask.test.ts`. Do not use detached `__tests__` directories.
