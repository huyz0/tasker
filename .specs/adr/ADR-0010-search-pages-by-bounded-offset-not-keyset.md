---
id: ADR-0010
status: accepted
date: 2026-08-15
milestone: M07
---

# Ranked search pages by bounded offset, not by a keyset cursor

## Context

M07-T05 added contentless FTS5 indexes (`tasks_fts`, `artifacts_fts`) maintained
by triggers. T06 switches `universalSearch` to read them, and its verify line is
that results are ranked **by relevance, not creation date**.

Every other list in this codebase paginates with a keyset cursor over
`(createdAt, id)` — `buildCursorPaginationWhere` — and search is no exception
today. That cursor cannot survive the change. A cursor over creation date cannot
page a result set ordered by `bm25()`: page two would be *filtered* by date and
*ordered* by relevance, which silently skips and repeats rows. So the ordering
change forces a pagination change; they are one decision, not two.

Search also merges two independently-paginated entity types into one list, so
whatever is chosen has to work twice, once per type.

Two facts were measured against SQLite rather than assumed, and both shaped the
decision:

- `bm25()` **is** usable in a `WHERE` clause, so a keyset predicate is
  syntactically available. The first draft of this ADR claimed otherwise.
- `EXPLAIN QUERY PLAN` for `... WHERE t MATCH ? ORDER BY bm25(t)` reports
  `SCAN t VIRTUAL TABLE INDEX 0:M1` followed by `USE TEMP B-TREE FOR ORDER BY`.
  Ordering by relevance materialises and sorts **the whole match set on every
  page**, whichever pagination is used.
- Ties are not hypothetical: in a six-row fixture, two rows scored an identical
  `-1.4666666666666667e-6`.

## Options

**A keyset cursor on `(bm25, rowid)`.** Carry the last row's score and rowid in
the cursor and filter `bm25(t) > :score OR (bm25(t) = :score AND rowid > :id)`.
Costs: it compares IEEE floats for equality to break ties, and ties are common
because bm25 is a function of term frequency over a short title — so a
mis-compare drops or repeats rows. It does not buy the usual keyset advantage
either: the plan above shows the full match set is scanned and sorted for every
page regardless, so the O(offset) cost that keyset pagination exists to avoid is
not actually avoided here. It is the more complex option and it buys stability
only.

**A bounded offset, carried inside the existing opaque cursor.** Costs: rows can
shift between pages if the underlying data changes mid-pagination, and offset
walks the sorted set. The second cost is bounded by capping how deep search will
page at all; the first is the standard behaviour of every ranked search product
and is invisible at the depths users actually reach.

**A materialised result set per search — a temp table or server-side session.**
Perfectly stable, and the only option that makes deep paging cheap. Costs
server-side state with a lifetime, an expiry policy, and a cleanup path, for a
feature whose whole purpose is to get someone to a result on page one.

## Decision

Search pages by an offset encoded inside the existing opaque cursor, bounded by
a hard cap on how deep a ranked search will page.

## Consequences

The wire contract is unchanged: `nextCursor` stays an opaque base64 string and
callers keep passing it back, so neither the GUI nor the CLI changes. The
per-type structure survives — the cursor holds one offset per entity type, as it
previously held one keyset cursor per entity type.

Deep paging is refused rather than served slowly. Past the cap, search stops
returning a `nextCursor`; a caller that wants row 5,000 is asking the wrong
question of a search box and should filter instead.

Results may shift between pages if a task is written mid-pagination. This is
accepted, and it is the specific thing the rejected keyset option would have
bought.

`buildCursorPaginationWhere` is no longer used by search but remains correct and
in use for every other list. This ADR does not generalise: **date-ordered lists
keep their keyset cursors**, because there the ordering column is indexed and
keyset genuinely avoids the scan. The reasoning here applies only where the sort
key is computed per query.

Artifact **bodies** stop being searched. `artifacts_fts` indexes `name` and
`description`; `content` holds 15 MB base64 blobs whose indexed form would be a
large index of unsearchable noise. This is a deliberate narrowing of behaviour,
recorded here because it is a user-visible loss and not an implementation
detail.
