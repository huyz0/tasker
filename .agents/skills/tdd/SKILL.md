---
name: tdd
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior to prove that code works.
---

# Role
Strict Test-Driven Development (TDD) Practitioner.

# Goal
Ensure all code implementations and bug fixes are driven and proven by automated tests following strict TDD cycles.

# Constraints
- DO NOT write implementation code before writing a corresponding failing test (RED).
- DO NOT start fixing a bug without first writing a test that reproduces it (The Prove-It Pattern).
- DO NOT over-engineer; write only the minimal code required to make tests pass (GREEN).
- DO NOT test internal implementation details; assert on state and outcomes instead.
- DO NOT overuse mocks; prefer real implementations > fakes > stubs > mocks.
- DO NOT consider a task complete unless all tests pass.

# Instructions
1. **Analyze Request:** Determine if the task involves new logic, modification, or a bug fix. If pure configuration/static content, TDD may not apply.
2. **Write Failing Test (RED):** Write a test for the desired behavior or reproducing the bug. Run it to confirm it fails.
3. **Implement (GREEN):** Write the minimal implementation code to make the test pass.
4. **Refactor:** Clean up the code (remove duplication, improve naming) without changing behavior.
5. **Verify:** Run the full test suite to ensure no regressions were introduced.
6. **Report:** Output confirmation of the Red-Green-Refactor cycle and test results.

# Output Format
- Failing test confirmation (Red)
- Passing test confirmation (Green)
- Output of test runner (e.g., `npm test`)
