# Standards binding M27 — Documentation Truth

Per `AGENTS.md` §3, standards are loaded per *task* (at most two).
`.agents/protocols/tdd.md` binds every task and does not count toward the two.

| Task | Surface | Load |
|------|---------|------|
| T02–T04 | `.specs/**`, `README.md` | none — the routing table has no entry for prose, and loading one to feel thorough is what it warns against. The binding constraint is `architecture.md`'s own rule that **Built** is present-tense-true and citable. |
| T05 | a new repo-level gate | `testing-standard` (the gate's own suite must be provably capable of failing, as `spec-drift.test.ts` is) |
| T06 | closeout | `milestone-standard` |

Points worth holding in view:

- Every correction must name the code that makes it true, in the journal. The
  failure mode for this milestone is replacing a confident wrong sentence
  with a confident wrong sentence.
- `docs-lint` validates the mermaid block in `NAVIGATION.md`; editing that
  map means running it.
- The gate follows `spec-drift`'s established shape — its own tests run
  first, then the check — because a rule that decides whether the specs are
  honest has to be provably capable of failing.
