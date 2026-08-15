---
id: ADR-0002
status: accepted
date: 2026-08-15
milestone: M02
---

# Serve search with LIKE scanning until M07 measures the need

## Context

`architecture.md` described a search layer that indexes content and serves reads
away from the transactional database. What runs is a `LIKE` scan:
`modules/search/search.handler.ts:35` builds
`column LIKE ? ESCAPE '\'` with `%`, `_` and `\` escaped in caller input.

An FTS5 virtual table exists and is misleading. `db/db.ts:27` creates
`search_index USING fts5(title, body, content="")` under a comment calling it a
"Proof Of Concept". The `content=""` option makes it **contentless** — rows must
be inserted explicitly, and nothing in the repository inserts one. Its only
reader is the health probe (`modules/health/health.handler.ts:24`), which runs a
`MATCH 'health'` against it to confirm the SQLite build has FTS5 compiled in.
The table is a capability check, not an index.

So the deviation is not "FTS5 instead of a search cluster". It is: **the search
path has no index at all**, on either dialect, and a table that looks like one.

## Options

**Populate the existing FTS5 table.** Cheap on SQLite, and the table is already
created. But MySQL is the clustered dialect and has no FTS5 — it would need
`FULLTEXT` indexes with different syntax and different ranking, so the two
deployments would diverge in search behaviour, which is the class of bug nobody
finds until a customer reports it.

**Introduce a dedicated search service now.** Correct at the target scale and
wrong today: it adds an operational component, a sync path, and an eventual
consistency window, for a dataset whose size nobody has measured.

**Keep `LIKE` and make the cost visible.** Correct results, linear cost. It is
the only option that ships nothing that has to be maintained before it is
needed.

## Decision

Search continues to scan with `LIKE` until **M07** measures real query latency
against a realistic dataset and chooses an index from evidence.

## Consequences

**Easier.** One code path, identical behaviour on MySQL and SQLite, no sync
lag, nothing to operate. Results are exactly correct — a scan cannot be stale.

**Harder.** Cost is linear in table size and there is no ranking; results come
back in whatever order the query planner produces, not by relevance. There is no
stemming, no phrase matching and no highlighting. Query latency will degrade
smoothly and without warning as data grows, because nothing alerts on it —
`lib/rpcMetrics.ts` records per-method latency into the log stream and no
threshold is enforced.

**Foreclosed.** Nothing. Every option above remains open, which is the point of
deferring.

**Debt this leaves behind.** The `search_index` table is a trap: it exists, it
is named like the real thing, and an agent reading `db.ts` will reasonably assume
search uses it. M07 must either populate it or drop it. Leaving a contentless
table named `search_index` is worse than having no table.
