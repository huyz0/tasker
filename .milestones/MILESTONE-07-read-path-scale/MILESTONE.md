---
id: M07
title: Read-Path Scale
status: in-progress
goal: No screen or endpoint loads an unbounded result set, and search is served by a real index rather than a leading-wildcard scan.
depends_on: [M05]
surfaces: [backend, gui, contract]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
---

# M07 — Read-Path Scale

## 1. Goal

The application answers within a stated latency budget against a database
seeded to the product's own scale targets: 2,000 projects, 50,000 tasks in a
project, 100,000 artifacts. Every list is paged at the API and virtualized in
the browser. Search uses a maintained index and returns ranked results with
snippets.

## 2. Why Now

The current read path calls `fetchAllPages` in the Tasks, Agents and Bin views,
which loops the cursor until exhaustion — 500 sequential round trips for a
50,000-task project. Artifact lists return the full content column, so a folder
of images transfers hundreds of megabytes to render a list of names. These are
correctness-adjacent at the stated scale, and they must be fixed before the
real-time work in M08 multiplies the traffic.

## 3. Exit Criteria

- [ ] `fetchAllPages` is used only where the full set is genuinely required, and
      each remaining use is justified in a code comment.
- [ ] No list response includes a large content column; artifact bodies are
      fetched individually.
- [ ] Search is served by SQLite FTS5 in standalone mode and a MySQL FULLTEXT
      index otherwise, returning ranked results with highlighted snippets.
- [ ] A documented latency budget exists per list endpoint, and measured p95
      figures against the seeded scale are committed to `PROGRESS.md`.
- [ ] Every list view renders its rows through a virtualizer.
- [ ] `EXPLAIN` output for each hot query shows an index in use.

## 4. Scope

**In Scope**: column projection, per-column task pagination, artifact content
separation, FTS5 and FULLTEXT search, index review, the load-generating seed
mode, virtualization of remaining lists.

**Out of Scope**: OpenSearch (explicitly deferred — the ADR from M02 records
that it is not adopted before measured need), caching layers, read replicas.

## 5. Task Breakdown

- [x] **M07-T01** — Add explicit column projection to `executePaginatedQuery` so
      each caller names the columns it needs.
      - Files: `apps/backend/src/db/query-builder.ts`, all list handlers
      - Verify: an artifact list response carries no `content` field.

- [x] **M07-T02** — Split artifact content into `getArtifactContent`; the list
      returns metadata and a size only.
      - Files: `modules/artifacts/artifacts.handler.ts`, `main.tsp`,
        `features/Artifacts/index.tsx`
      - Verify: listing a folder of 50 images transfers under 100 KB.

- [x] **M07-T03** — Give the Kanban board per-column pagination with server-side
      counts, removing the whole-project fetch.
      - Files: `modules/tasks/tasks.handler.ts`, `features/Tasks/index.tsx`, `main.tsp`
      - Verify: a 50,000-task project paints its first screen in under one second.

- [x] **M07-T04** — Remove `fetchAllPages` from the Agents, Bin and Labels views,
      replacing it with infinite queries plus virtualization.
      - Files: `features/Agents/`, `features/Bin/`, `features/Labels/`
      - Verify: each view issues one request on mount.

- [x] **M07-T05** — Maintain the SQLite FTS5 index on write for tasks and
      artifacts, backfilling existing rows in a migration.
      - Files: `apps/backend/src/db/searchIndex.ts`, handlers, migrations
      - Verify: creating a task makes it findable by a word in its description.

- [ ] **M07-T06** — Serve search from `MATCH` in standalone mode with ranking
      and snippet extraction.
      - Files: `modules/search/search.handler.ts`
      - Verify: results are ranked by relevance, not creation date.

- [ ] **M07-T07** — Add MySQL `FULLTEXT` indexes and the `MATCH … AGAINST` branch
      for the clustered dialect.
      - Files: `drizzle-mysql/`, `modules/search/search.handler.ts`
      - Verify: the MySQL integration test returns the same ranking.

- [ ] **M07-T08** — Extend search to projects, agents and comments now that it is
      index-backed, keeping the per-type cursor design.
      - Files: `modules/search/search.handler.ts`, `main.tsp`, `GlobalSearch.tsx`
      - Verify: searching an agent name finds the agent.

- [ ] **M07-T09** — Review indexes against the hot query set; add what is missing
      and record `EXPLAIN` output.
      - Files: `db/schema.*.ts`, migrations, `PROGRESS.md`
      - Verify: no hot query performs a full table scan.

- [ ] **M07-T10** — Extend the seed script to the product's scale targets and add
      a repeatable latency measurement script.
      - Files: `apps/backend/scripts/seed.ts`, `scripts/measure-latency.ts`
      - Verify: measured p95 numbers are committed.

- [ ] **M07-T11** — Document the latency budget per endpoint in
      `.specs/standards/api-standard.md`.
      - Files: `.specs/standards/api-standard.md`
      - Verify: each list endpoint has a stated budget.

## 6. Verification

```bash
cd apps/backend && bun run seed -- --scale large
bun run scripts/measure-latency.ts
moon run backend:test gui:test
```

## 7. Risks

FTS5 index maintenance on write adds latency to the hot create path. Keep the
index update inside the same transaction so it cannot drift, and measure the
write cost before and after — if it exceeds the write budget, move it behind
the M08 event consumer instead and note the change here.
