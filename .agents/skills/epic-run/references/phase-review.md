# Phase: Review

One reference, two phases. **Design review** judges artifacts before code exists;
**implement review** judges the diff. The mechanics are identical.

## Rules for both

- Resolve output paths and filenames from the work ledger's `reviews.name_templates`.
  Scan the target directory for the highest existing `v{N}` and write `N+1`.
  Never overwrite a review — the trace is the audit trail.
- Every review document carries frontmatter:
  ```yaml
  ---
  timestamp: [ISO 8601]
  decision: [approved|rejected]
  ---
  ```
- Update the matching `EPIC.md` field to `approved` or `rejected`. A phase marked
  `n/a` in `designs` must be `n/a` in `design_reviews` too.
- Load at most two standards via `context-inject`, chosen from the diff or the
  artifact under review. Do not load product foundations for an implement review.
- Autonomous mode **rejects on any Medium, High or Critical finding**. Interactive
  mode asks about focus areas, known struggles and deliberate deviations first.
- Findings are emitted as deterministic YAML inside the markdown — no tables —
  with `file`, `line`, `severity`, `comment`.

## Design review

Read the epic's scope, then judge each artifact that is not `n/a`:

- **Architecture** — scalability, failure modes, security posture, and whether the
  ADRs record real alternatives rather than post-hoc justification.
- **UX** — against `.specs/standards/ui-ux-standard.md` and `.specs/design/`;
  are the empty, loading, error and denied states specified?
- **Test plan** — Given/When/Then form, and whether every Definition-of-Done item
  maps to an executable scenario. Coverage of edge cases, not just the happy path.

## Implement review

Analyse the implementation diff in a single pass across four lenses:

- **Code quality** — complexity, edge cases, completeness against the task
  breakdown and Definition of Done, missing stories, hardcoded mocks.
- **QA coverage** — implemented tests against `TEST-PLAN.md`, scenario by
  scenario. A scenario with no test is a gap, not a nit.
- **Architectural drift** — implementation against `ARCHITECTURE.md`. Undocumented
  boundary crossings are findings.
- **Security** — authorization gaps, tenancy scope, data exposure, injection,
  secret handling, per `.specs/standards/security-standard.md`.

Then run `local-ci-run`. A review cannot be approved while CI fails, and the run's
result goes in the summary.

## Severity

| Level | Meaning | Action |
|---|---|---|
| Critical | Security hole, data loss, breaks production | Block |
| High | Wrong behaviour, significant performance defect | Block |
| Medium | Maintainability defect, minor bug | Block in autonomous mode; discuss in interactive |
| Low | Style, nit, suggestion | Record only |
