# M27 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M27-T01 — Save the design record (spec, ADR-0024)

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `.specs/specs/2026-08-23-2100-documentation-truth/` (shape.md,
  plan.md, standards.md), `.specs/adr/ADR-0024-*.md`, this MILESTONE.md,
  STATE.md ledger + roadmap.
- **Verified**: files exist; `moon run tasker:docs-lint` clean. Every false
  statement enumerated in `shape.md` was re-checked against the code in this
  session before being written down, not carried over from the review that
  found them.
- **Notes**: the design turns on one observation — of the five product/design
  documents, `tech-stack.md` is the only clean one and the only gated one.
  ADR-0024 records why the gate detects *milestone ownership* rather than
  attempting prose truth: a checker cannot know whether "the CLI has no TUI"
  is still true, but it can know that a document says a closed milestone owns
  unbuilt work, and that described nearly every stale claim found. The ADR is
  equally explicit about what stays uncaught (a false claim citing no
  milestone — `NAVIGATION.md`'s "no breadcrumb component" is exactly that
  shape and only a human reading found it), so a green gate is not mistaken
  for a true document.
  Documents are corrected before the gate lands, so no commit leaves
  `moon check --all` red; T05's demonstration against the pre-M27 text from
  git history is what supplies the red-phase evidence instead.
- **Next**: M27-T02 (correct README.md).

## M27-T02 — Correct README.md

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: five corrections. The real-time callout now describes the feed
  that exists (`modules/events/`, `hooks/useLiveEvents.ts`, backoff, polling
  fallback, header indicator). The teams claim is gone. The single-binary
  callout describes what `build:standalone` actually produces, citing
  `bundle-gui.ts`, `embeddedMigrations.ts` and `staticServer.ts`. The
  read-path/measurement sentence is replaced by a precise account of what is
  and is not measured. Scope count corrected.
- **Verified**: every path cited in the new text checked to exist (six of
  six). Milestone references in the file are now two, both historical
  attribution ("Delivered by M08", "Delivered by M09") rather than pending
  ownership. `docs-lint` clean.
- **Notes**: two things worth recording.
  1. **The scope count was wrong in my own plan.** The spec said "ten"
     (the original eight plus M21's memory pair); counting
     `AGENT_SCOPES` directly gives **eleven**, because M26 added
     `events:read` four commits ago. Corrected to eleven, and
     `docs/agent-integration.md`'s table verified to list all eleven. This
     is the exact failure this milestone is about — a count asserted from
     memory of a document rather than from the code — caught only because
     the task's own rule is to verify every claim at the source.
  2. The "none has been measured" sentence was **half** false, and the half
     that was false flattered the project. Rather than delete it, the
     replacement states precisely which axis is measured (data scale, with
     the fixture sizes and the budget file named) and which never has been
     (concurrency — no load test exists, and 100,002 rows is not 100,002
     callers). A reader now gets a sharper claim than the original, not a
     quieter one.
- **Next**: M27-T03 (correct architecture.md).

## M27-T03 — Correct .specs/product/architecture.md

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: eight corrections in **Built** — agent identity (now the
  first-class principal it has been since M04, citing `agentToken.ts`,
  `scopes.ts`, `authz.ts` and the sweep), search (real FTS5/`FULLTEXT`, not
  `LIKE`), event consumers (the two deliberately-different subscribers, and
  the feed's authorization incl. ADR-0023's agent filtering), streaming (one
  server-streaming RPC, not "all unary"), OpenTelemetry (installed, exporter
  only when configured), rate limiting (exists, and is per-instance — stated
  as the limitation it is), and both counts (21 services not fourteen, 19
  modules not twelve). The **Planned Architecture** section was rewritten:
  four of its seven entries had shipped and moved to Built.
- **Verified**: all twelve newly-cited paths exist. Every milestone reference
  remaining in the file is historical attribution ("Delivered by M04",
  "(M21-T06)", "M08's streaming endpoint") — none claims pending ownership.
  The three surviving "there is no X" claims in Built were each re-checked
  and are true (server-side rendering, in-process transport per ADR-0019,
  and an OTLP collector when unconfigured). `docs-lint` clean.
- **Notes**: the section header used to read "Each entry names its owning
  milestone" — which cannot be honest now that every milestone is closed. It
  says so explicitly instead: nothing there has an owner, so each entry is
  genuinely unscheduled rather than queued. Writing that down surfaced three
  gaps worth naming rather than losing — **signed binaries** (deferred
  identically by M09 and M12 for want of certificates, which otherwise makes
  "portable single binary" read as complete), **measured concurrency** (the
  largest gap between claim and evidence in the product, and nobody's
  milestone), and the fact that **ADR-0003's own deferral condition is
  unmeasurable today** — it defers a read store pending measurement, and the
  measurement that would trigger it is the concurrency nothing measures.
- **Next**: M27-T04 (correct NAVIGATION.md).

## M27-T04 — Correct .specs/design/NAVIGATION.md

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: the route map and route table gained the seven missing routes
  (`/register`, `/handoffs`, `/memory`, `/memory/:beliefId`, `/roles`,
  `/task-types`, `/teams`); "Teams does not exist at all" and the orphaned
  `/settings` claim are gone; §4's breadcrumb rule moved from "required, not
  built" to "enforced today"; the file's own preamble no longer promises that
  unbuilt rules name an owning milestone, since none can.
- **Verified**: route parity checked mechanically — every `path=` in
  `App.tsx` appears in the table and vice versa, zero difference in both
  directions. All seven cited components exist. `docs-lint` (which validates
  the mermaid block) clean.
- **Notes**: three claims were false in a way worth distinguishing. "Teams
  does not exist at all" and "`/settings` renders `GenericPlaceholder`,
  nothing links to it" were **stale** — both shipped (M10; `/settings` routes
  to `SystemHealthPage` and sits in the Configuration group). But "there is
  **no breadcrumb component in the repository** — `grep -i breadcrumb
  apps/gui/src` returns nothing" was a *checkable* claim that had simply
  stopped being true: `Breadcrumbs.tsx` exists with a test and a story, and
  is mounted by both `features/Artifacts` and `features/Tasks`. It is the
  clearest example of what the T05 gate cannot catch — it cites no milestone,
  so nothing mechanical would flag it, and only running the grep it invited
  found it. ADR-0024 says so explicitly rather than letting a green gate
  imply otherwise.
- **Next**: M27-T05 (the doc-drift gate).

## M27-T05 — The doc-drift gate

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `scripts/doc-drift.ts` (four pending-ownership patterns, the
  ledger read from `STATE.md`, exit 0/1/2 mirroring `spec-drift`),
  `scripts/doc-drift.test.ts` (27 tests), a `doc-drift` task in `moon.yml`
  with its own suite running first, and `moon run :spec-drift :doc-drift` in
  CI's specification-drift step.
- **Verified**: **against real history, not a fixture** — reconstructed the
  four documents as they stood at `b43b48c` (the M26 merge, before any
  correction in this milestone) and ran the gate over them: **22 findings**,
  naming every stale claim T02–T04 fixed, across all three documents, with
  the correct line and pattern for each. On the corrected documents it passes.
  The wired task was then shown to fail by appending one stale sentence to
  `README.md`, then restored. `moon check --all` clean at 34 tasks (was 33).
- **Notes**: the test suite pins **both** directions, and the second is the
  one that decides whether this gate survives. Nine "must pass" cases are
  real forms taken from the corrected documents — `Delivered by M08`,
  `(M08-T02/T03)`, `M08's streaming endpoint`, `whose "until M08" this
  discharges`, `### Observability and deployment (M08)`. Historical
  attribution is legitimate and frequent in these files; a checker that
  flagged it would be switched off within a week and would then be protecting
  nothing.
  Two deliberate refusals in the script worth carrying forward: the checked
  set is a **hand-written list, not a glob**, because `.specs/` is full of
  ADRs and journals that correctly describe the past; and
  `readClosedMilestones` **throws rather than returning empty** when the
  ledger is unreadable, because a silently-empty closed set would make every
  document pass forever — the worst failure available to a gate, and the one
  M26 spent a milestone removing elsewhere.
- **Next**: M27-T06 (verification and closeout).
