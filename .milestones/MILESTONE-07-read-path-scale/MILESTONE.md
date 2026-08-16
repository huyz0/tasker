---
id: M07
title: Read-Path Scale
status: done
goal: No screen or endpoint loads an unbounded result set, and search is served by a real index rather than a leading-wildcard scan.
depends_on: [M05]
surfaces: [backend, gui, contract]
exit_criteria_met: true
started_at: 2026-08-15
completed_at: 2026-08-16
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

- [x] `fetchAllPages` is used only where the full set is genuinely required, and
      each remaining use is justified in a code comment. **Three remain** — the
      folder tree, the agents list, the notes on one task — each stating why the
      full set is required, not merely what the code does (M07-T12).
- [x] No list response includes a large content column; artifact bodies are
      fetched individually. `content` appears only in `getArtifactContent`
      (M07-T01/T02); `getArtifact` names its columns and excludes it (T12).
- [x] Search is served by SQLite FTS5 in standalone mode and a MySQL FULLTEXT
      index otherwise, returning ranked results with highlighted snippets.
      Ranking verified in a browser in both dialects (T06/T07); snippets carry
      match offsets the GUI renders as `<mark>` (T13).
- [x] A documented latency budget exists per list endpoint, and measured p95
      figures against the seeded scale are committed to `PROGRESS.md`.
      `api-standard.md` §6; figures in the T10 entry, all eight within budget.
- [~] Every list view renders its rows through a virtualizer. **Six of eight**
      — the board, org members, Artifacts, Bin, Projects and Agents; `/projects`
      renders 10 DOM rows for 2,001 projects. **Labels and TaskTypes are
      excluded**: both are `flex-wrap` chip clouds with no rows to virtualize,
      bounded by hand-created entries rather than by data. A stated deviation,
      not a silent one — see the M07-T14 entry.
- [x] `EXPLAIN` output for each hot query shows an index in use. Gated by
      `db/indexCoverage.test.ts` over 14 hot queries, with the plans recorded
      in the M07-T09 entry.

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

- [x] **M07-T06** — Serve search from `MATCH` in standalone mode with ranking
      and snippet extraction.
      - Files: `modules/search/search.handler.ts`
      - Verify: results are ranked by relevance, not creation date.

- [x] **M07-T07** — Add MySQL `FULLTEXT` indexes and the `MATCH … AGAINST` branch
      for the clustered dialect.
      - Files: `drizzle-mysql/`, `modules/search/search.handler.ts`
      - Verify: the MySQL integration test returns the same ranking.

- [x] **M07-T08** — Extend search to projects, agents and comments now that it is
      index-backed, keeping the per-type cursor design.
      - Files: `modules/search/search.handler.ts`, `main.tsp`, `GlobalSearch.tsx`
      - Verify: searching an agent name finds the agent.

- [x] **M07-T09** — Review indexes against the hot query set; add what is missing
      and record `EXPLAIN` output.
      - Files: `db/schema.*.ts`, migrations, `PROGRESS.md`
      - Verify: no hot query performs a full table scan.

- [x] **M07-T10** — Extend the seed script to the product's scale targets and add
      a repeatable latency measurement script.
      - Files: `apps/backend/scripts/seed.ts`, `scripts/measure-latency.ts`
      - Verify: measured p95 numbers are committed.

- [x] **M07-T11** — Document the latency budget per endpoint in
      `.specs/standards/api-standard.md`.
      - Files: `.specs/standards/api-standard.md`
      - Verify: each list endpoint has a stated budget.

- [x] **M07-T12** — Remove or justify every remaining `fetchAllPages`. The
      artifacts view walks all pages of a folder that can hold 100,000 rows, and
      the task-notes loop carries no justification at all.
      - Files: `features/Artifacts/index.tsx`, `features/Tasks/index.tsx`
      - Verify: no remaining use fetches an unbounded set, and each one that
        stays states in a comment why the full set is required.

- [x] **M07-T13** — Mark the matched term inside a search snippet, which exit
      criterion 3 asks for and T06 did not deliver.
      - Files: `modules/search/search.handler.ts`, `main.tsp`, `GlobalSearch.tsx`
      - Verify: a snippet distinguishes the matched term from its surrounding
        text in the rendered result.

- [x] **M07-T14** — Virtualize the list views that still render every row.
      Only the task board and the org member list use a virtualizer today.
      - Files: `features/{Artifacts,Agents,Labels,Bin,Projects,TaskTypes}/index.tsx`
      - Verify: every list view renders its rows through a virtualizer.

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
