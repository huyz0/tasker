# Heavy Tasks

Most milestone tasks are implemented directly. A few need a decision recorded
and a review run before the box is checked. This is that escalation.

It replaces the former epic lifecycle. An epic was a wrapper that carried design
artifacts *and* a second copy of task tracking; the tracking already exists in
`MILESTONE.md` and `PROGRESS.md`, so only the artifacts and the gates survive.

## When a task is heavy

Any one of these is enough:

- The task's approach has a **real alternative with a consequence** — an ADR.
- It changes a boundary between components, or introduces a new one.
- It touches authorization, tenancy, tokens or secrets.
- It adds a screen or a flow a user has to learn — a UX pass.
- Its behaviour is hard to state in a single `Verify` line — a test plan.

If none apply, implement it directly. Ceremony on a small task is waste, and the
journal entry is the record.

## Before the code

Resolve every path through `@.agents/protocols/work-ledger.md`. Produce only what
the task actually needs:

**ADR** — `.specs/adr/ADR-<id>-<title>.md`, format in that directory's README.
Name the option you rejected and what it would have cost. An ADR with one option
is a description, not a decision.

**UX** — the ledger's `ux_design` path. Cover the empty, loading, error and
permission-denied states. Those are where generated UI is thinnest and where
review findings cluster. Conform to `.specs/design/` and `ui-ux-standard.md`.

**Test plan** — the ledger's `test_plan` path, per `test-plan-standard.md`. Pure
Given/When/Then. Every acceptance criterion maps to at least one executable
scenario; a scenario nobody can run is a comment. The plan then binds the
implementation — write inside those scenarios.

Record in the journal which artifacts the task produced, and which it skipped and
why. "Skipped the ADR, no alternative existed" is a useful sentence.

## After the code

One review pass, four lenses, before the box is checked:

- **Correctness** — edge cases, error paths, completeness against the task's
  stated outcome. No hardcoded mocks left in production paths.
- **Test coverage** — implemented tests against the test plan, scenario by
  scenario. A scenario with no test is a gap, not a nit.
- **Architectural drift** — implementation against the ADR. Undocumented boundary
  crossings are findings; documented ones are fine.
- **Security** — authorization, tenancy scope, data exposure, injection, secret
  handling, per `security-standard.md`.

Write the result to the ledger's `reviews` path, scanning for the highest
existing `v{N}` and writing `N+1`. Never overwrite a review — the trace of what
was rejected is the audit trail. Frontmatter carries `timestamp` and
`decision: approved | rejected`.

Findings are emitted as YAML inside the markdown — no tables — with `file`,
`line`, `severity`, `comment`.

| Severity | Meaning | Action |
|---|---|---|
| Critical | Security hole, data loss, breaks production | Block |
| High | Wrong behaviour, significant performance defect | Block |
| Medium | Maintainability defect, minor bug | Block in autonomous mode; discuss in interactive |
| Low | Style, nit, suggestion | Record only |

Then run `local-ci-run`. A task is not done while CI fails, and the run's result
goes in the journal entry.

## On rejection

A rejected review sends the task back to implementation with the findings — it
does not fail the milestone. After two consecutive rejections, escalate per
`@.agents/protocols/verification-gates.md`: stop, record the failing output
verbatim, and say what decision is needed.
