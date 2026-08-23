---
id: M27
title: Documentation Truth
status: in-progress
goal: The documents an agent session is told to treat as ground truth describe the product that exists, and a gate fails when they stop doing so.
depends_on: []
surfaces: [specs, infra]
exit_criteria_met: false
started_at: 2026-08-23
completed_at: null
---

# M27 — Documentation Truth

## 1. Goal

`AGENTS.md` instructs every agent session to treat `.specs/` as ground truth
and to read `README.md` first. Those documents currently describe a product
roughly eight milestones behind the code, in the present tense:

- `README.md` says the GUI **is not real-time** (M08 shipped it), teams have
  **no table in the schema yet** (M10 shipped it), and a portable single
  binary **is M09** — contradicting the same README's own instructions for
  running `./tasker`.
- `.specs/product/architecture.md` promises, in its own words, that
  everything in its **Built** section is present-tense-true and citable. It
  states there that agent identity **is not separate from human identity**,
  that search **is `LIKE`-based** with an index nothing writes to, that
  **there is no subscriber anywhere in the repository**, and that telemetry
  is **not OpenTelemetry** — while later sections of the same file assert the
  opposite. Its entire **Planned Architecture** section describes seven
  milestones that are all closed.
- `.specs/design/NAVIGATION.md` asserts **"Teams does not exist at all"**,
  that `/settings` renders a placeholder **nothing links to**, and that
  **there is no breadcrumb component in the repository**. All three are false.

This is not tidiness. It is a defect in the agent harness: a session that
reads these files makes wrong decisions from them. M02 exists precisely to
make `.specs/` traceable to running code, and this is that guarantee lapsed.

The milestone corrects them and then does the thing that keeps them
corrected. `tech-stack.md` is the only one of these documents that is clean,
and it is the only one with a gate (`:spec-drift`). That correlation is the
whole argument.

## 2. Why Now

Found by a holistic scope review after M25, verified claim-by-claim against
the code, and named by M26 as the natural next round. Every numbered
milestone through M26 is `done` and the roadmap's Phase 1 and Phase 2 are
fully delivered, so nothing is blocked behind it.

M26's thesis was that a gate which is trusted and does not cover its stated
surface is worse than no gate, because it gets cited as evidence. These
documents are the same failure in prose: they are *designated* as ground
truth by `AGENTS.md`, and nothing checks them.

## 3. Exit Criteria

- [ ] Every statement in `README.md`, `.specs/product/architecture.md` and
      `.specs/design/NAVIGATION.md` that describes shipped work as unbuilt is
      corrected — enumerated in the spec, each with the evidence that it
      shipped.
- [ ] `.specs/product/architecture.md`'s **Built** section contains no claim
      contradicted by a later section of the same file.
- [ ] A `doc-drift` gate exists, runs in `moon check --all` and in CI, and
      fails when a document designated as ground truth cites a `done`
      milestone as owning unbuilt work.
- [ ] The gate is demonstrated to catch the **real** historical drift, not a
      synthetic fixture: run against the pre-M27 text of each document from
      git history, it names the stale claims this milestone fixes.
- [ ] The gate has its own test suite proving each rule is capable of
      failing, mirroring `spec-drift.test.ts`'s convention of running before
      the check it guards.
- [ ] `moon check --all` clean, `moon run tasker:docs-lint` clean.

## 4. Scope

**In Scope**: correcting `README.md`, `.specs/product/architecture.md` and
`.specs/design/NAVIGATION.md`; a `scripts/doc-drift.ts` gate plus its test
suite and moon/CI wiring; ADR-0024 recording how staleness is detected and
what was rejected; the spec folder.

**Out of Scope** (each with its reason): `.specs/product/mission.md` needs no
correction — it is pure intent and claims no measurement — though it joins
the gate's checked set so it cannot drift later. The unmeasured
concurrency claim (20,000 agents is a design target that has never been
simulated; only data scale is measured) is a real gap but a *true* statement
of intent rather than a false statement of fact — correcting the README's
wording about it is in scope, actually measuring it is a milestone of its
own. `NAVIGATION.md`'s missing routes (Memory, Handoffs, Teams, Roles, Task
Types are absent from its map) are corrected here, but a general "every route
in `App.tsx` appears in the route table" gate is not — that is a GUI-shaped
check and belongs with a GUI round.

## 5. Task Breakdown

- [x] **M27-T01** — Save the design record: the spec folder (the enumerated
      false statements and how each was verified) and `ADR-0024` on detecting
      documentation staleness mechanically — naming the rejected options
      (extend `spec-drift.ts` rather than a sibling; grammar/keyword
      matching; requiring every claim to carry a machine-readable status
      annotation) and what each costs. No product code.
      - Files: `.specs/specs/2026-08-23-2100-documentation-truth/*`,
        `.specs/adr/ADR-0024-*.md`,
        `.milestones/MILESTONE-27-documentation-truth/*`, `.milestones/STATE.md`
      - Verify: files exist; `moon run tasker:docs-lint` passes.

- [x] **M27-T02** — Correct `README.md`: the real-time callout, the teams
      claim, the single-binary callout, the read-path/measurement sentence,
      and the scope count (it says eight; there are now ten). The Mission
      Scale wording becomes honest rather than deleted — data scale *is*
      measured and within budget; concurrency is not, and saying exactly that
      is more useful than "none has been measured".
      - Files: `README.md`
      - Verify: every corrected claim checked against the code that
        implements it, cited in the journal.

- [x] **M27-T03** — Correct `.specs/product/architecture.md`: the six false
      **Built** claims (agent identity, search, event consumers, streaming,
      OpenTelemetry, rate limiting), the module and service counts, and the
      **Planned Architecture** section, whose seven subsections all describe
      closed milestones. Work that shipped moves into **Built** with its
      citation; the section keeps only what is genuinely unplanned.
      - Files: `.specs/product/architecture.md`
      - Verify: no claim in **Built** contradicted elsewhere in the file;
        every cited path exists.

- [x] **M27-T04** — Correct `.specs/design/NAVIGATION.md`: the mermaid map
      and route table gain the seven missing routes; the "Teams does not
      exist", orphaned-`/settings` and no-breadcrumb claims go; the
      "Required, not built — M06 owns these" section is resolved against what
      M06 actually shipped.
      - Files: `.specs/design/NAVIGATION.md`
      - Verify: every route in `App.tsx` appears in the route table;
        `docs-lint` (which validates the mermaid block) passes.

- [x] **M27-T05** — Build the `doc-drift` gate: `scripts/doc-drift.ts` plus
      `scripts/doc-drift.test.ts`, mirroring `spec-drift`'s shape (own suite
      first, then the check; exit 0 agreement / 1 drift / 2 could not run),
      wired into `moon.yml` and CI. Demonstrate it against the pre-M27 text
      of all three documents recovered from git history — it must name the
      real stale claims, not a synthetic fixture.
      - Files: `scripts/doc-drift.ts`, `scripts/doc-drift.test.ts`,
        `moon.yml`, `.github/workflows/ci.yml`
      - Verify: `moon run :doc-drift` exits zero on the corrected docs and
        non-zero on the originals; its own suite proves each rule can fail.

- [ ] **M27-T06** — Verification and closeout: re-verify every exit
      criterion, `moon check --all`, close the milestone.
      - Files: `.milestones/*`
      - Verify: `moon check --all` clean; each criterion stated as
        test-proven or observed.

## 6. Verification

```bash
moon check --all
moon run :doc-drift
moon run tasker:docs-lint
```

## 7. Risks

- **Correcting prose by rewriting rather than verifying.** The failure mode
  here is replacing one confident wrong sentence with another. Every
  correction in T02–T04 names the code that makes it true, in the journal,
  the same way the original claims cited milestones.
- **A gate that only catches the drift already known.** Written naively, the
  rules would be fitted to these three documents and catch nothing new. The
  demonstration required by T05 is against *history*, and the rules are
  structural (a milestone cited as owning unbuilt work) rather than a list of
  the specific sentences being fixed.
- **False positives making the gate hated and disabled.** Historical
  attribution — `(M09-T02/T03)`, `M08's streaming endpoint`, `whose "until
  M11" this discharges` — is legitimate and common in these files. The rules
  must distinguish it from pending ownership, and the test suite must pin
  both directions.
