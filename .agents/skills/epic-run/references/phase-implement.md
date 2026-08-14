# Phase: Implement

Turn the task breakdown into working code inside the boundaries the design set.

## Pre-flight

- Every `design_reviews` field is `approved` or `n/a`. If not, stop — the gate
  has not opened.
- If any `reviews` field is `rejected`, this is **recovery**, not fresh work: read
  the newest `-v[N].md` trace and address its findings before touching a new task.

## Per task

1. Take the first unchecked task in document order.
2. Interactive: confirm the task and ask whether there are file-path or approach
   constraints. Autonomous: proceed.
3. Load the two most relevant standards via `context-inject`. Not more.
4. Implement, following `tdd` — a failing test first, then the minimal code that
   passes it, then refactor.
5. Write the tests that cover the new behaviour and the stories for any new UI
   component. This is the gate, not a follow-up.
6. Run the test suite. It must pass, and local CI must pass before the epic closes.
7. Check the box only now. Interactive: confirm first.
8. Record any divergence — files touched that the plan did not name, or a task
   whose real shape differed from its description.

## Rules

- Implement against `ARCHITECTURE.md`'s boundaries and `TEST-PLAN.md`'s scenarios.
  Deviating is allowed; deviating silently is not.
- No hardcoded mock data left in production paths.
- A task with no test is not done, whatever the code looks like.
- After two consecutive failures on the same task, stop and escalate per
  `.agents/protocols/verification-gates.md`.

## Close

When every box is checked and the suite is green, hand off to implement-review.
