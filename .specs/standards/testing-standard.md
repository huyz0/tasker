# Testing & QA Standards

## 1. Test-Driven Development (TDD)

- **Workflow**: Red-Green-Refactor.
  1. **Red**: Write failing test first.
  2. **Green**: Minimum code to pass.
  3. **Refactor**: Clean up and optimize.
- **Result**: Enforces decoupled, cohesive design boundaries prioritizing public
  API consumption.

## 2. Test Coverage Goals

- **Minimum Base**: 80% combined (Statements/Branches/Functions).
- **Target Strategy**: 90% strictly for Backend Bounded Contexts (Domain logic)
  and complex Frontend hooks.
- **Enforcement**: CI fails PRs if baseline drops.
- **Agent Rule**: AI Agents MUST run local testing suites
  (`npx moon run <project>:test` or `.agents/skills/local-ci-run/`) to
  mechanically verify test passes before moving issues to 'Done'.

## 3. Focus Areas

- **Unit (Vitest)**: Fast, single-purpose testing. Bulk of the 80% coverage
  goal.
- **Integration**: Boundary tests (API Handlers against DB, React against Mock
  Handlers).
- **E2E (Playwright)**: Critical 'Happy Paths' only. Do not rely heavily on E2E
  for percentage goals due to runtime costs.

## 4. Co-location

- **Rule**: Tests reside adjacent to code. `CreateTask.ts` lives next to
  `CreateTask.test.ts`. Do not use detached `__tests__` directories.
