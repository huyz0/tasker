# Testing & QA Standards

This document establishes the expectations for code testing, coverage, and the development workflow, particularly emphasizing Test-Driven Development (TDD).

## 1. Test-Driven Development (TDD)
- **Workflow**: We use the Red-Green-Refactor cycle as our primary development approach.
  1. **Red**: Write a failing test for a new functional requirement, boundary condition, or bug *before* writing any production code.
  2. **Green**: Write the absolute minimum amount of code necessary to make the test pass.
  3. **Refactor**: Clean up, optimize, and organize the implementation safely, governed by the passing test.
- **Design Impact**: TDD forces you to think about the public API and usage of your module before dealing with its internal implementation. This naturally results in decoupled, highly cohesive code that avoids "feature envy".

## 2. Test Coverage Targets
- **Baseline Minimum**: All code (both frontend and backend) must maintain a strict minimum of **80% test coverage** for statements, branches, and functions.
- **Target Goal**: We aim to achieve **90% coverage**, particularly within the Backend's core Domain logic (Bounded Contexts) and the Frontend's complex custom hooks and utility functions.
- **Enforcement**: CI pipelines should be configured to fail if a pull request drops the overall project coverage below 80% or fails to cover new statements adequately.

## 3. Focus Areas and Tools
- **Unit Tests (`Vitest`)**: Fast, heavily isolated tests focusing on single functions, classes, or hooks. The majority of your 80-90% coverage goal should be achieved here.
- **Integration/Component Tests**: Testing the boundaries. For example, testing a Backend CQRS Command handler against an in-memory or integration DB, or testing a React component using React Testing Library to ensure it interacts correctly with mock server states.
- **E2E Tests (`Playwright`)**: Used for critical 'Happy Path' user flows (e.g., authentication, core task submission). These are not heavily relied upon for percentage-based coverage metrics due to execution time.

## 4. Test Co-location
- Test files must reside right next to the code they are testing. For example, `CreateTaskCommand.ts` must have a corresponding `CreateTaskCommand.test.ts` in the exact same directory. Do not separate tests into a global `__tests__` folder.
