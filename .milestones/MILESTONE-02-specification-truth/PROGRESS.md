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
