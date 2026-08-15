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
