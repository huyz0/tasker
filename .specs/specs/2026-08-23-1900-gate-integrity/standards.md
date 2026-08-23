# Standards binding M26 — Gate Integrity

Per `AGENTS.md` §3, standards are loaded per *task* (at most two).
`.agents/protocols/tdd.md` binds every task and does not count toward the two.

| Task | Surface | Load |
|------|---------|------|
| T02 | agent tokens, scopes, authorization | `security-standard`, `api-standard` |
| T03 | the authorization sweep (tests) | `security-standard`, `testing-standard` |
| T04 | backend DB / migrations | `api-standard`, `testing-standard` |
| T05 | build tooling + types across the backend | `coding-standard`, `testing-standard` |
| T06 | verification / closeout | `testing-standard` (+ `milestone-standard` for the `.milestones/**` edits) |

Points worth holding in view for every task here:

- `security-standard`: this milestone touches what an agent token may read.
  A change that widens delivery is a tenancy question, not a formatting one —
  the existing `eventScope` tests are the regression guard and must pass
  untouched. That is a design constraint, not just a wish: `SubscriptionScope`
  carries neither principal kind nor scopes today, so the new field must be
  optional and default to unfiltered, or every existing test's object literal
  breaks. Optional-and-defaulting is also the correct shape — a human
  session's feed is unchanged by this milestone.
- `testing-standard`: every fix in this milestone ships with the guard that
  would have caught it. A fix without its guard leaves the milestone's own
  thesis unimplemented, and should be treated as incomplete rather than done.
- `coding-standard`: type fixes stay type-level. A type error is occasionally
  load-bearing; anything that would need a behaviour change to satisfy the
  compiler gets recorded rather than quietly altered.
