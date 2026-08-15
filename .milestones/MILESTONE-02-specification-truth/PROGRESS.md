# M02 — Specification Truth · Progress Journal

Append-only. One entry per task attempt, newest last. The entry is opened with
status `in-progress` before the work starts and closed in the commit that
completes the task.

---

## M02-T01 — Rewrite tech-stack.md from the actual manifests

**Date**: 2026-08-15
**Status**: done
**Approach**: Read every committed manifest, grep each named technology for real
imports, and rewrite the document as In Use / Planned / Dropped.

**Protocol note**: the journal was opened after the evidence-gathering greps and
the first draft, not before. Step 13 says before. Recording it rather than
back-dating; the work was recoverable from the branch either way.

**Changed**: `.specs/product/tech-stack.md` — rewritten as In Use / Planned /
Dropped. 54 "In Use" identifiers, each traceable to `package.json`,
`apps/cli/go.mod` or `.prototools`.

**Verified**: both directions, scripted. 54/54 claimed entries appear in a
manifest; all 61 manifest packages are documented or explicitly exempt
(`@types/*`, `shared-contract`, `@scope/*` wildcards).

**What the evidence changed about the plan**:

- The old document named Shadcn, Radix, React Flow, MSW, ESLint, Prettier,
  Typedoc, Stylelint, Viper, Charmbracelet, `mcp-go`, OpenSearch, OTel and SSR.
  None are installed. Confirmed by grep against every manifest.
- **NATS is real** — 18 source files import it. The backend publishes; nothing
  consumes. That is M08, not a missing dependency.
- **FTS5 is half-real.** A `search_index` virtual table is created in
  `src/db/db.ts` and read only by the health probe. Nothing writes to it, and
  `search.handler.ts:35` uses `LIKE`. M02-T03's premise ("LIKE in place of
  FTS5") is right about search and wrong about the table's absence — the ADR
  must say the table exists and is unpopulated.
- Added a **Dropped** section, which the task did not ask for. In Use / Planned
  alone would have forced SSR, React Flow, Typedoc, Stylelint, MSW, ArkType,
  Charmbracelet, Viper, `mcp-go`, Chromatic and Checkly into "Planned" with
  invented owners. An ambition no milestone owns is not a plan.

**Divergence**: two unused root devDependencies found — `better-sqlite3` (zero
imports, not a `drizzle-kit` peer) and `@storybook/addon-onboarding`. Recorded
under "Known manifest drift" rather than removed, because deleting dependencies
inside a documentation task is out of its stated scope. M02-T04 forces the call.

**Deferred**: ADR links. Naming `ADR-0003`…`ADR-0007` here before M02-T03
writes them would ship three dead links — the exact defect this milestone
exists to remove.

---

## M02-T02 — Rewrite architecture.md so present tense describes the built system

**Date**: 2026-08-15
**Status**: done
**Approach**: Split the document into **Built** — where every present-tense
mechanism cites the file that implements it — and **Planned Architecture**,
where each entry names its owning milestone. Evidence comes from reading the
source, not from the prior document.

**Changed**: `.specs/product/architecture.md` — rewritten. Also
`.specs/product/tech-stack.md`, two corrections found while reading the source
(below).

**Verified**: scripted, both halves. 58 backticked path citations extracted and
resolved against the filesystem, including line numbers against file length —
0 broken. Every `###` subsection of **Built** cites at least one file. Eight
line citations were off by one to three lines on first draft (`index.ts:37→38`,
`:49→51`, `:156→157`, `:161→162`, `:167→169`, `:40→41`, `authz.ts:39→38`) and
were corrected against `grep -n`, not against memory. `moon run tasker:docs-lint`
clean.

**What the evidence changed about the plan**:

- **Elysia is not the HTTP server.** The listener is `node:http` (`index.ts:157`)
  with `connectNodeAdapter` mounting fourteen Connect services. Elysia handles
  exactly two route groups, `/api/auth/*` and `/api/debug/*`. T01's tech-stack
  row said "HTTP server" — corrected in this commit.
- **The in-process transport is a named stub.** `index.ts:34` exports
  `localInProcessTransportRouter`, three lines returning
  `{status: 200, message: "in-process override active"}`, referenced by nothing
  in `apps/` or `packages/`. The old document described it as working. This is
  worse than an absent feature: the name and the export make it look delivered.
- **The standalone binary's placeholder lies in its own text.** `index.ts:151`
  serves `<p>Embedded Vite SPA Assets active.</p>`, while
  `backend:build-standalone` compiles `src/index.ts` alone and bundles no
  asset. Recorded verbatim so M09 inherits the fact, not the sentence.
- **No streaming exists.** The old NFR section justified Connect-RPC partly by
  bi-directional streaming; the TypeSpec contract declares no streaming method.
- **Multi-tenancy is application-level**, not "row-level access controls
  implemented via Drizzle ORM" as claimed. It is `assertOrgMember` /
  `getOrgMemberRole` called by handlers (`lib/authz.ts`).
- The NFR table was rewritten as *what exists* rather than targets. "P95 < 50ms
  achieved" and "40K concurrent connections" had no benchmark behind them; the
  table now says what is measured (per-method latency into the log stream) and
  hands the numbers to M07/M11/M12.

**Divergence**: the CQRS section does not promise OpenSearch. M02-T02 as written
says to move OpenSearch into Planned, which would keep it as a commitment with
an owner. T01 already found no milestone owns it, so the planned section names
the *capability* (a read store, decided against measured need under M07) and
lists OpenSearch as one candidate. Naming a product no one has chosen is the
same defect in a different section.

**Deferred**: ADR links. The exit criterion "each deliberate deviation has an
ADR" is M02-T03; `.specs/adr/` currently holds only `README.md`. Note for T03:
the task names `ADR-0003…ADR-0007`, but **ADR-0001 and ADR-0002 do not exist** —
the numbering in the milestone plan assumed predecessors that were never
written.

---

## M02-T03 — ADRs for the deviations already made

**Date**: 2026-08-15
**Status**: done
**Approach**: Five decisions, one file each, in the format `.specs/adr/README.md`
defines. Each must name the option actually rejected and the milestone that
would revisit it — a file that cannot name the alternative is documenting an
implementation, not a decision. Then link every one from `architecture.md`,
which is the task's verify line.

**Changed**: five new files in `.specs/adr/`, plus the linking edits in
`.specs/product/architecture.md` and one forward reference in `tech-stack.md`.

| ADR | Decision | Revisit |
|-----|----------|---------|
| 0001 | oxlint alone, no ESLint, no formatter | unowned |
| 0002 | `LIKE` scanning; the FTS5 table is a capability probe | M07 |
| 0003 | no separate read store before measurement | M07 |
| 0004 | in-process counters over Pino, not OTel | M11 |
| 0005 | hand-rolled UI primitives, not Shadcn/Radix | M06 |

**Verified**: scripted. All 18 relative links in `architecture.md` and
`tech-stack.md` resolve on disk, and every `ADR-*.md` file in `.specs/adr/` is
referenced by name from `architecture.md` — checked in both directions, so a
sixth ADR added later without a link fails the same check. `docs-lint` clean.

**Divergence — numbering**: the task specifies `ADR-0003…ADR-0007`. **ADR-0001
and ADR-0002 do not exist and never did**; the plan assumed predecessors that
were never written. Using 0003–0007 would leave two permanent unexplained holes
at the start of the sequence — spec drift of exactly the kind this milestone
exists to remove. Numbered 0001–0005 instead. Filenames also carry a kebab title
(`ADR-0001-oxlint-instead-of-eslint-and-prettier.md`) because
`.specs/adr/README.md` requires `ADR-<4-digit>-<kebab-title>.md`, which the task
line omitted.

**What the evidence changed about the plan**:

- The task frames ADR-0004 as "`LIKE` search in place of FTS5". The real
  situation is worse and is now recorded as such: the FTS5 table is created with
  `content=""` (contentless — rows must be inserted explicitly), nothing inserts
  one, and its only reader is the health probe running `MATCH 'health'` to prove
  the SQLite build has FTS5 compiled in. There is **no index on either dialect**.
  ADR-0002 names the table a trap M07 must either populate or drop.
- ADR-0001 could not honestly claim a rejection of ESLint, because none was
  recorded. Written as a retroactive ratification, with the specific cost named:
  oxlint runs no type-aware rules, so `no-floating-promises` and
  `no-misused-promises` are unenforceable, and no formatter runs at all — there
  is no `.oxlintrc.json` anywhere in the repository.
- ADR-0005 gained a concrete recommendation rather than a preference, from two
  failures already on record: `button.tsx`/`card.tsx` shipped as unstyled
  passthroughs, and the app had no `:focus-visible` indicator at all. Both
  hand-rolled overlays (`GlobalSearch.tsx:79`, `features/Tasks/index.tsx:485`)
  handle `Escape` but declare neither `role="dialog"` nor `aria-modal` and trap
  no focus. The ADR tells M06 to install Radix for overlay primitives only.
- ADR-0003 and ADR-0004 turned out to lean on each other: ADR-0003 defers the
  read-store decision to measurement, and ADR-0004 leaves that measurement
  per-process and volatile. Stated explicitly in both files rather than left for
  a reader to notice.

---

## M02-T04 — spec-drift check

**Date**: 2026-08-15
**Status**: done
**Approach**: A script comparing every declared manifest identifier against the
**In Use** tables of `tech-stack.md`, failing in both directions — an undeclared
entry and an undocumented dependency are the same defect seen from either side.
Tests first, then the script, then a deliberate break: add a real dependency and
confirm the gate fails. Wired into `moon check --all` and the CI Workspace job.

**Changed**: `scripts/spec-drift.ts`, `scripts/spec-drift.test.ts` (21 tests),
`moon.yml` (`tasker:spec-drift`), `.github/workflows/ci.yml` (Workspace job),
and `.specs/product/tech-stack.md` — which the check immediately proved wrong in
seven places.

**Sources read**: root and workspace `package.json` files, `apps/cli/go.mod`
(direct requires only), and `.prototools` (pins above `[settings]`). 62 declared
identifiers, 58 documented, 0 drift.

**Verified**: three ways.

1. `bun test scripts/spec-drift.test.ts` — 21 tests, each breaking exactly one
   thing: both directions, `@types/*` exemption, `@scope/*` wildcard coverage
   and its limits, workspace-internal skip, built-ins, go direct vs `// indirect`
   vs single-line require, `.prototools` `[settings]`, first-column-only
   parsing, Planned entries not counting as documentation, and a missing
   `## In Use` section throwing rather than silently passing.
2. **Deliberate break** — added `date-fns` to root `devDependencies`. The check
   reported exactly one finding and exited 1; restoring the manifest returned it
   to 0. `git diff --stat package.json` confirmed a clean restore.
3. `moon check --all` is now 23 tasks and green; `bunx knip` clean.

**What the evidence changed about the plan**:

The check found seven drifts on its first run against the real tree, four of
which were prose the document had that the tables did not: the TypeSpec/buf
toolchain, and the `node`/`moon` pins in `.prototools`. Those sections are now
tables. Prose is not enforceable, which is the whole argument for this task.

The other three were **two wrong claims I wrote in M02-T01**, both from the same
mistake — concluding "unused" from the absence of an `import`:

- **`better-sqlite3` is load-bearing.** `drizzle-kit` does
  `import("better-sqlite3")` inside its own bundle for the `sqlite` dialect and
  declares it as no kind of peer, so it must be declared here or
  `drizzle-kit push --config drizzle.sqlite.config.ts` breaks. T01 called it
  "zero imports, not a dependency or peer of `drizzle-kit`" and listed it as a
  removal candidate. Removing it would have broken sqlite migrations.
- **`@storybook/addon-onboarding` is an active addon**, registered at
  `apps/gui/.storybook/main.ts:13`. T01 called it leftover scaffolding.

The "Known manifest drift" section is now a correction section saying so, with
the reasoning that produced the error, because the next agent will be tempted by
the same grep.

**Divergence**: the task frames the check as "comparing declared dependencies
against `tech-stack.md`" — one direction. It runs both. A document naming a
package nobody installed is the defect this milestone opened with: an agent
reads `tech-stack.md`, imports Radix, and the build fails. Catching only
undocumented additions would leave that class untouched.

---

## M02-T05 — Reconcile NAVIGATION.md with the routes that exist

**Date**: 2026-08-15
**Status**: done
**Approach**: Extract the route table from `App.tsx`, diff it against every
route named in `NAVIGATION.md`, and rewrite the document to match. Rules that
describe behaviour nothing implements — breadcrumbs, nested context — get
labelled M06-owned rather than deleted. Verify by script, both directions.

**Changed**: `.specs/design/NAVIGATION.md` — rewritten as a route map, a route
table, a "what is not a route" section, and rules split into enforced vs
required-and-unbuilt.

**Verified**: scripted, both ways. Every node label in the mermaid diagram
resolves to a `<Route path="…">` in `App.tsx`, and every declared route appears
in the table: **14 diagram nodes, 14 declared routes, 0 mismatches**. Cited
lines checked individually (`AppShell.tsx:22-29`, `:75`,
`Organizations/index.tsx:20`, `App.tsx:43`). The breadcrumb claim was confirmed
by the grep the document quotes — it returns nothing. `docs-lint` clean.

**What the evidence changed about the plan**:

- **The old diagram had almost no routes in it.** Its nodes were concepts —
  "Org Settings", "Teams View", "Project Hub", "Activity Log", "Agent Config".
  None is a route; `Teams` does not exist in any form (that is M10) and there is
  no `/projects/:projectId` at all. The verify line, "every route in the mermaid
  map exists in `App.tsx`", could not have been satisfied by patching labels, so
  the rule is now explicit at the top: **a node in the diagram is an address**.
  Everything else moved to §3.
- **Six real routes were missing from the document**: `/labels`, `/bin`,
  `/settings`, `/login`, `/oauth/callback` and the `*` Not Found catch-all, plus
  the two detail routes M01 added. The sidebar has eight items; the old diagram
  drew six.
- **`/settings` is orphaned** — the route resolves and renders
  `GenericPlaceholder`, and nothing in the application links to it. Recorded as
  a decision M05 has to make (entry point or delete) rather than silently
  documented as if it were reachable.
- **Rule 2 described a URL the router answers with Not Found.** It required the
  sidebar to keep `Projects` highlighted while at `/projects/xyz/tasks/123`. No
  nested route of that shape exists, so there is no context to retain. It is now
  a requirement conditional on M05 building project-scoped routes.
- **Rule 3 required breadcrumbs on every detail view**; there is no breadcrumb
  component anywhere in `apps/gui/src`. Labelled M06.

**Recommended, not built**: the route/table agreement was verified with a
throwaway script. The same argument that justifies `spec-drift` applies here —
`NAVIGATION.md` will drift the moment someone adds a route. A permanent check
belongs in `moon check`, but M02's exit criteria name only the dependency drift
check, and T05's file list is `NAVIGATION.md` alone. Flagging it for M05, which
is the milestone that will actually add routes.
