---
active_milestone: M03
active_task: M03-T03
last_updated: 2026-08-15
last_commit: d72f873
blocked: false
blocker: null
---

# Delivery State

> **Read this file first.** It is the single entry point for any agent or human
> resuming delivery. It is committed to git, so the state of the work travels
> with the repository and survives the end of any session.

## Now

- **Milestone**: M03 — IAM Correctness & Scale
- **Task**: M03-T03 — wrap `purgeOrg` in one transaction
- **Branch**: `feature/m03-iam-correctness-and-scale`
- **Command to continue**: `/milestone-deliver M03`

M02 closed 7/7 tasks and 5/5 exit criteria. M03 and M05 both have their
dependencies satisfied and can run in parallel on separate branches.

## How to resume

1. Read this file.
2. Read `.milestones/MILESTONE-<active>/MILESTONE.md` for the plan.
3. Read that milestone's `PROGRESS.md` — the last entry names the task in
   flight and why it was left there.
4. Run `/milestone-deliver` (interactive) or `/milestone-deliver-auto`
   (autonomous). Both pick up from the first unchecked task.

If `blocked: true`, read `blocker` above and resolve it before continuing.

## Milestone ledger

| ID  | Milestone                      | Status | Depends on | Tasks | Done |
|-----|--------------------------------|--------|------------|-------|------|
| M01 | Stabilize the Build            | done   | —          | 14    | 14   |
| M02 | Specification Truth            | done   | M01        | 7     | 7    |
| M03 | IAM Correctness & Scale        | in-progress | M01   | 14    | 2    |
| M04 | Agent Identity & M2M Tokens    | todo   | M03        | 12    | 0    |
| M05 | GUI / API Parity               | todo   | M01        | 12    | 0    |
| M06 | UX, Design System & A11y       | todo   | M05        | 13    | 0    |
| M07 | Read-Path Scale                | todo   | M05        | 11    | 0    |
| M08 | Events, Audit & Real-Time      | todo   | M04, M07   | 11    | 0    |
| M09 | Portable Single Binary         | todo   | M05, M07   | 9     | 0    |
| M10 | Teams & Policy-Based RBAC      | todo   | M03, M04   | 13    | 0    |
| M11 | Observability & Deployability  | todo   | M08        | 12    | 0    |
| M12 | Test Depth & Release           | todo   | M06,M09,M11| 11    | 0    |

**Total: 139 tasks across 12 milestones.**

## Dependency graph

```mermaid
graph LR
  M01[M01 Stabilize] --> M02[M02 Spec Truth]
  M01 --> M03[M03 IAM]
  M01 --> M05[M05 GUI Parity]
  M03 --> M04[M04 Agent Identity]
  M05 --> M06[M06 UX & A11y]
  M05 --> M07[M07 Read Scale]
  M04 --> M08[M08 Events & Realtime]
  M07 --> M08
  M05 --> M09[M09 Single Binary]
  M07 --> M09
  M03 --> M10[M10 Teams & RBAC]
  M04 --> M10
  M08 --> M11[M11 Observability]
  M06 --> M12[M12 Test & Release]
  M09 --> M12
  M11 --> M12
```

Milestones with no dependency edge between them may run in parallel on separate
branches. M02 is intentionally cheap and unblocking — it can run alongside
anything.

## Handoff notes

**2026-08-15 — M02 Specification Truth closed (7/7 tasks, 5/5 exit criteria).**

`.specs/` now describes the system that exists. What changed, and the three
things a next session would otherwise rediscover the hard way:

1. **`moon run :spec-drift` is a gate now** (`moon check --all` is 23 tasks;
   CI Workspace job runs it). It compares every manifest identifier against the
   **In Use** tables of `tech-stack.md`, both directions, and has 21 tests.
   Adding a dependency without a table row fails the build — verified by
   injecting `date-fns`. Prose does not count: the check reads table cells, and
   four of the seven drifts it found on its first run were entries the document
   described in prose the tables did not carry.
2. **Do not conclude "unused" from a missing import.** M02-T01 marked
   `better-sqlite3` and `@storybook/addon-onboarding` as removal candidates on
   that reasoning. Both are load-bearing: `drizzle-kit` does
   `import("better-sqlite3")` inside its own bundle for the sqlite dialect and
   declares it as no kind of peer, and the addon is registered at
   `apps/gui/.storybook/main.ts:13`. Removing the first would have broken
   `drizzle-kit push --config drizzle.sqlite.config.ts`.
3. **`api-standard.md` was rewritten and its previous contents are void.** It
   described REST — resource URIs, HTTP verb semantics, `/api/v1/` versioning, a
   `{ data, meta }` envelope — for a system that serves contract-first
   Connect-RPC. It is auto-injected for API work by `AGENTS.md` §3, so any past
   session that added an endpoint was reading the wrong architecture. Three
   other standards told agents to run `npx`/`npm`, which `AGENTS.md` forbids,
   and `testing-standard.md` specified 80% coverage against a 95% enforced gate.

Five ADRs now exist in `.specs/adr/` (0001–0005), numbered from 1 rather than
the 0003–0007 the plan assumed — its predecessors were never written. They
record oxlint-only linting, `LIKE` search, no separate read store, in-process
counters over OTel, and hand-rolled UI primitives. Each names what it forecloses
and the milestone that would reverse it.

**Criterion 5 is observed, not inferred.** `main` was fast-forwarded to this
work and pushed; CI run 31857839549 passed all six jobs, and the **Specification
drift** step ran inside the Workspace job. The earlier hedge in this note — that
the gate was configuration until a run was seen — is retired. The separate
**Real Integration Tests** workflow still fails on every push, as it has since
at least July: it needs `GITHUB_TEST_TOKEN` / `GITHUB_TEST_REPO` secrets.
Pre-existing and untouched by M02.

**Deliberately deferred**: a permanent gate for `NAVIGATION.md`. Its route map
was verified against `App.tsx` by a throwaway script (14 nodes, 14 routes) and
will drift the moment someone adds a route. The same argument that justifies
`spec-drift` applies, but M02's exit criteria name only the dependency check.
Flagged for **M05**, which is the milestone that adds routes.

**Two open decisions handed to later milestones**: `/settings` is a route that
renders a placeholder and that nothing links to — M05 either gives it an entry
point or deletes it. And the `search_index` FTS5 table is contentless with no
writer, read only by the health probe — M07 must populate it or drop it, because
a table named `search_index` that indexes nothing is a trap.

**2026-08-15 — The gates are tested now.**

A fresh review looking for structural weakness rather than answering a set
question found one that dwarfed the rest: **1,151 lines of harness script with
zero tests**, deciding whether every skill, workflow and adapter in the
repository is sound. Three of their rules had already turned out to be wrong
when checked by hand this session.

1. **`validate.test.mjs` — 24 tests, zero dependencies** (`node:test`). Each
   builds a fixture harness in a temp dir, breaks exactly one thing, and asserts
   the matching rule fires. A rule that cannot be made to fail enforces nothing.
   `HARNESS_ROOT` / `DESIGN_LINT_ROOT` are testing seams; nothing sets them in
   normal use. The suite runs *before* the gate in `moon run :skills-check`.
2. **`skill-forge evolve` read data nobody records.** It asked for "the session's
   friction". Retargeted to the four records that exist: `PROGRESS.md` divergence
   lines and `blocked` entries, `STATE.md` handoff notes, and
   `git log --stat -- .agents/` for churn.
3. **Nothing said file content is data.** Skills read `.specs/`, source, command
   output and fetched pages and act on them. `context-budget.md` now has a Trust
   section, and `AGENTS.md` §5 carries the one-line rule: instructions come from
   the user, the running skill, and its protocols — nowhere else.

Known and unfixed: portability is verified structurally (adapter parity, host
character limits) but has never been *observed* — nothing in this repo has been
run under Codex or Antigravity. Treat the claim as configuration, not evidence.

**2026-08-15 — Epic lifecycle retired; harness cut to 16 skills.**

A per-skill audit asked whether each one earns its place. The command layer had
been skipped in the previous review — the invocable surface is skills *and*
commands, and only 19 of 44 had been examined.

1. **The epic system is gone.** All 8 epics were created 2026-03-30 to
   2026-04-27; milestones arrived 2026-08-15 and no epic ran again. Its only
   live references were five milestone tasks pointing at `.epics/adr/`, a
   directory `git log` proves never existed. `epic-run` and `epic-archive` are
   deleted; their design and four-lens review discipline is
   `milestone-deliver/references/heavy-task.md`, reached from step 12.
2. **ADRs have a real home**: `.specs/adr/`, with a format README. Decisions
   outlive the work item, so they sit beside the specs. Reviews and UX go to
   `.milestones/<MILESTONE>/{reviews,design}/`. `work-ledger.yml` is v3 with no
   `epics` type.
3. **`epic-prioritize` → `milestone-prioritize`.** Same 8-advisor council; it now
   reads the milestone registry and feeds `/milestone-plan`. Reports go to
   `.milestones/council/`.
4. **`tdd` is a protocol, not a skill.** It never produced an artifact and you
   never run it *instead of* a task. `.agents/protocols/tdd.md` now binds every
   implementation path automatically. `/tdd` is gone.
5. **`epic-standard.md` moved to `.archive/EPIC-FORMAT.md`** — it documents a
   format nothing generates. It is out of `index.yml`.
6. **Command descriptions route now.** All 25 read like "Milestone Deliver" —
   their own name in title case. The generator takes the skill's description
   instead, trimmed to the "what" half because Claude Code loads skill *and*
   command entries and copying both pays twice.

Tier 0 is **5,482 chars ≈ 1,370 tokens** — up from 1,043, deliberately. The old
figure was cheap because 400 of its chars said nothing. It also corrects an
earlier entry that reported 943 tokens by counting only skills.

New validator rules: two workflows resolving to the same skill *and* mode
(`/epic-prioritize` and `/epic-prioritize-auto` were byte-identical for a
session), and a command description that only restates its name. Both were
verified by injection.

Verified: `moon check --all` 22 tasks · validator 0/0 · 160 markdown files clean.

**2026-08-15 — Harness reviewed for token cost, consistency and scope.**

1. **Routing moved into the always-on layer.** `AGENTS.md` §3 now carries a
   surface → standards table. Selecting the two binding standards no longer
   costs an `index.yml` read or a skill invocation; `/context-inject` is for the
   ambiguous case only. Tier 0 fell 4,069 → 3,773 chars (≈943 tokens for 19
   skills).
2. **Scope is explicit.** `context-budget.md` now defines what a *task*, a
   *session* and a *sub-agent* each load and drop. Sub-agents get paths and
   their own brief — never the orchestrator's accumulated context.
3. **Consistency is enforced, not asked for.** The validator now fails on
   `# Execution Mode` (the section is `# Modes`), an `-auto` workflow against a
   skill with no `# Modes` table, `AskUserQuestion` without the autonomy
   protocol, and a second lockfile inside a skill.
4. **`markdown-lint` was quietly broken twice.** Its default `**/*.md` skipped
   every dot-directory, so "lint everything" checked 7 files and ignored
   `.agents/`, `.specs/` and `.milestones/`; and it claimed in a comment to
   honour a project config it never read. Both fixed. It also shipped its own
   `bun.lock` and 22MB of `node_modules` — a second lockfile
   `dependency-standard.md` forbids. Its three dependencies now come from the
   workspace root and are declared in `knip.json`'s `ignoreDependencies`,
   because knip cannot see `.agents/**`.
5. **`moon run :docs-lint` is now a gate**, in `moon check --all` and CI. The
   whole tree is clean (160 files). Conventions that differ from markdownlint's
   defaults are recorded with reasons in `.markdownlint-cli2.jsonc` — notably
   MD025 (skills use sibling `#` sections by design) and MD029 (skill steps are
   numbered across the file, so `--fix` must not restart them per section).

Verified: `moon check --all` 22 tasks pass · validator 0 errors 0 warnings.

**2026-08-15 — UI/UX design harness added (outside the milestone plan).**

Researched the 2026 design-skill landscape (Vercel Web Interface Guidelines,
Anthropic `frontend-design`, `plugin87/ux-ui-agent-skills`) and adopted the
patterns rather than the packages — Snyk's ToxicSkills audit found 36.8% of
scanned third-party skills flawed.

1. **`/design-review`** — judges rendered screenshots, not source.
   `apps/gui/scripts/screenshot.mjs <route>` captures light and dark at
   375/768/1280 with reduced motion, and reports console errors. Needs the dev
   server and `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64` on this box.
2. **`moon run gui:design-lint`** is now part of `moon check --all` and CI. It
   fails on raw hex, raw Tailwind palette utilities, token pairs below WCAG AA,
   and the statically checkable Web Interface Guidelines. Escape hatch:
   `design-lint-disable-next-line <rule> — <reason>`.
3. **axe is real.** `jest-axe` is installed and every page asserts
   `expectNoA11yViolations`. `ui-testing-standard.md` §1 had required this since
   it was written while axe was never installed. Do **not** add `axe-core` as a
   direct dependency — `jest-axe` brings it and `knip` fails the build on it.
4. **Design-system tokens gained status semantics** — `success`/`warning`/`info`
   with solid and subtle pairs, plus `destructive-subtle`. Four pre-existing
   WCAG AA failures were fixed by adjusting `--primary`, `--muted-foreground`,
   `--destructive` (light) and dark `--primary-foreground`, so the app's purple
   and red are marginally darker than before.
5. **`Card` and `Button` were unstyled `<div>`/`<button>` passthroughs.** The
   screenshot loop caught it in the first capture. Both now carry their Shadcn
   styling, and `Button` has the `variant`/`size` API that
   `frontend-standard.md` §1 already described.

Verified: `moon check --all` 21 tasks pass; `CI=true moon run gui:e2e` 13 pass;
the a11y gate was confirmed to fail on an injected `button-name` violation.

**2026-08-15 — Agent harness consolidated (outside the milestone plan).**

The harness in `.agents/` was rebuilt against four reference systems (agent-os,
oh-my-claudecode, metaswarm, get-shit-done) and the verified skill conventions of
Codex, Antigravity and Claude Code. No milestone task was touched.

What a next session needs to know:

1. **Slash commands changed.** `/epic-define`, `/epic-design`,
   `/epic-design-review`, `/epic-implement`, `/epic-implement-review` and
   `/epic-end-to-end` are now one skill, `/epic-run` (`/epic-run-auto` runs every
   phase). `/standards-create`, `/standards-discover` and `/standards-index` are
   `/standards-manage`. `/standards-inject` and `/product-inject` are
   `/context-inject`. `/skill-manage` is `/skill-forge`. `/caveman` is gone — its
   rules are always-on in `.agents/protocols/response-style.md`.
2. **`.claude/` is generated.** Never hand-edit it. Run
   `node .agents/skills/skill-forge/scripts/sync-adapters.mjs` after any change
   under `.agents/`. All 18 skills and 23 workflows now have adapters; before
   this, only three did.
3. **`moon check --all` now includes `tasker:skills-check`**, which fails on dead
   path references, host-limit overruns, adapter drift and standards-index drift.
   It is also a CI step in the Workspace job.
4. **`.epics/` and `.test-plans/` are empty and no longer exist.** All three
   remaining epics were `done` with every review approved, so they and the nine
   test plans were archived to `.archive/`. The directories reappear when
   `/epic-run` starts the next epic.

Pre-existing and untouched: `markdown-lint` reports 487 errors repo-wide (was 615
across the same files), almost all `MD060` table style in the epic-prioritize
advisor references. It is not part of `moon check`.

**2026-08-15 — M01 Stabilize the Build closed (14/14 tasks, 7/7 exit criteria).**

What changed, in one pass: the GUI's task and artifact detail views are driven
by the URL, unknown routes render a Not Found view, and every global-search
result resolves to a route that renders its entity. The health probe no longer
writes to the database it reports on (1,000 pings leave the file
byte-identical), and a migration clears the rows earlier builds left. CI now
runs the GUI suite behind its 95% coverage gate plus a real Playwright job
against a seeded backend; the Go toolchain is pinned to what `go.mod`
requires; `knip` gates unused files, dependencies and exports; backend fixtures
fail loudly instead of swallowing errors; and the pre-commit hook is one
documented command away from active.

Three things a next session should know:

1. **A clean clone now bootstraps itself** — every JS-consuming task depends on
   `shared-contract:install-deps`. That task is deliberately anchored to
   `packages/shared-contract`, not the workspace root: moon derives the ROOT
   project's id from the checkout directory name, so a `root:`/`tasker:` target
   breaks in a clone named anything else. Do not "tidy" it back to the root.
2. **Use the `:task` form for root tasks** — `moon run :dev`,
   `moon run :setup-hooks`. Plain `moon run dev` fails with "No default project
   has been configured"; that is why the README changed.
3. **`gui:e2e` is `type: run` on purpose**, keeping it out of `moon check` (and
   so out of the pre-commit hook), because it needs a booted backend, a seeded
   database and installed browsers. CI runs it explicitly after seeding one.

A follow-up pass then cleared the residuals this close had left open: the seed
is re-runnable against one database, `bun run test` no longer wipes the local
dev data (it opened with `rm -rf .data`), artifact list invalidations no longer
read a stale folder id from a mutation closure, knip runs as its own CI job
rather than only inside `moon check`, and the inert `.moon/toolchain.yml` is
gone so `.prototools` is the sole home of the version pins. Note that
`moon setup` is still a no-op — moon 2 ignores that file's deprecated platform
keys — and toolchains come from proto's `auto-install`.

Exit criterion 3 is now **observed**, not inferred: `main` was fast-forwarded to
this work and pushed, and CI ran all six jobs green — Shared Contract, Workspace
(knip), GUI, GUI E2E (Playwright), Backend, CLI. The first run was red and worth
recording: `gui:e2e` exited "No tasks found", because `type: run` (which keeps
e2e out of `moon check`, and so out of the pre-commit hook) also implies
`runInCI: false`. Every local run had passed because `CI` was unset. `runInCI`
is now explicit. A workflow that declares the right jobs is not the same as one
observed to run them — which is why that criterion was hedged.

The separate **Real Integration Tests** workflow (`integration.yml`) still fails
on every push, as it has since at least July: it needs `GITHUB_TEST_TOKEN` /
`GITHUB_TEST_REPO` secrets to hit a real GitHub sandbox. Pre-existing and
untouched by M01.

M02, M03 and M05 all have their dependencies satisfied now and can run in
parallel on separate branches. M02 is the cheap unblocking one.
