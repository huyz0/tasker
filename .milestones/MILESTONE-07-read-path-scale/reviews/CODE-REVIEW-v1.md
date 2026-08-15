---
timestamp: 2026-08-15
decision: approved
task: M07-T06
scope: apps/backend/src/modules/search/search.handler.ts, its test, ADR-0010
---

# M07-T06 — Search served from MATCH, ranked by bm25

Four lenses over the FTS5 switch. One High finding was raised and fixed inside
this pass; it is recorded rather than quietly folded in, because it was a real
defect in the shipped shape of the cursor and the same shape existed before this
task.

## Correctness

The one that mattered:

```yaml
- file: apps/backend/src/modules/search/search.handler.ts
  line: 180
  severity: High
  comment: >
    Paging restarted an entity type once it was exhausted. The next cursor
    omitted the offset for a type with no rows left, and an omitted offset is
    indistinguishable from "no cursor yet", so the type restarted at zero and
    returned its rows again on every page the other type kept alive. Reproduced
    with one matching task and five matching artifacts at limit 2: ten rows
    returned for six distinct ids, the lone task repeated five times. Fixed by
    always carrying both offsets and terminating only when both types are
    exhausted. Note this shape predates T06 — the previous keyset cursor omitted
    an exhausted type's cursor in exactly the same way — so it is a fix, not a
    regression introduced here.
```

```yaml
- file: apps/backend/src/modules/search/search.handler.ts
  line: 128
  severity: Low
  comment: >
    `ORDER BY bm25(...), t.id` tie-breaks on id. This is load-bearing rather
    than cosmetic: bm25 ties are common (a six-row fixture produced two
    identical scores), and without a deterministic tie-break, offset paging can
    reorder tied rows between pages and skip one. Recorded so it is not
    "simplified" away later.
```

```yaml
- file: apps/backend/src/modules/search/search.handler.ts
  line: 117
  severity: Low
  comment: >
    Relevance ordering is per entity type; the merged list is tasks-then-
    artifacts, not one globally ranked feed. This is the pre-existing structure
    of the response and the ADR does not change it, but "ranked by relevance"
    should be read as "within each type".
```

## Test coverage

Nine scenarios added, all executable, all run:

- ranking beats recency — the verify line, with the strong match deliberately
  the **older** row so a passing test cannot be explained by date ordering
- whole-word matching (`cat` no longer finds `concatenate`)
- snippet centred on the match rather than the first 100 characters
- a word appearing only in a description is still found
- artifact bodies are no longer searched — the recorded narrowing, asserted so
  the loss is visible rather than discovered
- artifact descriptions still are
- FTS5 operator characters treated as literal text, and operator *words*
  demoted to ordinary terms
- punctuation-only query returns empty rather than raising
- paging without repeats or skips; lopsided paging (the High finding); and the
  depth cap, which also asserts `totalCount` still reports the true total

One pre-existing test was replaced rather than deleted: the LIKE `_`-escaping
test guarded an exposure that no longer exists, and its replacement guards the
equivalent exposure in FTS5's query language. Recorded because a deleted test is
a coverage loss unless something takes its place.

## Architectural drift

Implementation matches ADR-0010. The offset lives inside the existing opaque
cursor, so the wire contract is unchanged and neither the GUI nor the CLI was
touched — confirmed by driving the real GUI search rather than by inspection.

One documented boundary crossing: raw SQL instead of the query builder. The join
is on `rowid`, an implicit SQLite column the drizzle schema does not model, and
`bm25()` must appear in both the projection and the `ORDER BY`. Stated in the
function's own comment.

`buildCursorPaginationWhere` is now unused by search and still used by every
other list. The ADR is explicit that this decision does not generalise:
date-ordered lists keep keyset cursors, because there the sort column is indexed
and keyset genuinely avoids the scan.

## Security

```yaml
- file: apps/backend/src/modules/search/search.handler.ts
  line: 60
  severity: Low
  comment: >
    Injection surface is the FTS5 query language, not SQL. `orgId` and the match
    expression are bound parameters, and the expression is assembled only from
    `\p{L}`/`\p{N}` runs, so no operator character can reach the parser. The
    defence is the allowlist, not escaping — worth keeping that way, since
    escaping FTS5 quoting correctly is harder than refusing to carry it.
```

Tenancy is unchanged and still enforced twice: `assertOrgMember` before the
query, and `p.org_id = ?` inside both branches. Soft-deleted rows are excluded
in both. `requireUser` still refuses agent principals, matching the existing
deny-by-default sweeps.

No new data is exposed: the projection returns id, title/name and description,
and artifact `content` is not selected at all — which is also why bodies stopped
being searchable.

## Result

Approved. `backend:test` — 618 pass, 0 fail.
