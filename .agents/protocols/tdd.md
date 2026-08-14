# Protocol: Test-Driven Development

This was a skill. It never produced an artifact — its "output" was evidence that
a cycle had happened — and you never run it *instead of* a task, only *while*
doing one. That is a constraint, not an action, so it lives here and binds every
implementation path automatically instead of waiting to be invoked.

## The cycle

1. **Red** — write a test for the desired behaviour, or one that reproduces the
   bug, and **run it to confirm it fails**. A test that has never failed proves
   nothing; it may be asserting something that was always true.
2. **Green** — write the minimal implementation that makes it pass. Not the
   design you would like to end up with. Minimal.
3. **Refactor** — remove duplication and improve naming without changing
   behaviour. The tests stay green throughout.
4. **Verify** — run the whole suite, not just the new test, to catch what the
   change broke elsewhere.

## Rules

- MUST NOT write implementation before a failing test exists for it.
- MUST NOT fix a bug before a test reproduces it. A fix without a reproduction is
  a guess that happens to work.
- MUST NOT assert on internal state or implementation details. Assert on the
  outcome a caller can observe. A test coupled to the implementation fails on
  every refactor and catches nothing.
- Prefer real implementations, then fakes, then stubs, then mocks — in that
  order. A suite built on mocks tests the mocks.
- MUST NOT treat a task as complete while any test fails.

## When it does not apply

Pure configuration, static content, and generated code have no behaviour to
drive. Say so rather than writing a test that asserts a constant equals itself.

## Deliberate-break check

When a test passes on the first run, that is a signal, not a success. Break the
code it covers and confirm the test fails. A test that cannot fail is a comment
with a runtime cost — this repository has shipped several.
