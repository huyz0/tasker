---
id: M02
title: Specification Truth
status: in-progress
goal: Every claim in .specs/ is traceable to running code, and every unbuilt ambition is a dated roadmap item owned by a specific milestone.
depends_on: [M01]
surfaces: [specs]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
---

# M02 — Specification Truth

## 1. Goal

`.specs/` becomes what the README already claims it is: the declarative source
of truth. An agent that reads `tech-stack.md` and writes code against every
library it lists produces code that compiles. An agent that reads
`architecture.md` and reasons about the event flow reasons about the flow that
actually exists. Aspirations are still recorded — as roadmap entries pointing
at the milestone that will deliver them, not as descriptions in the present tense.

## 2. Why Now

This is the highest-leverage milestone per hour spent, and it must precede all
feature work. Every subsequent agent session loads these documents as ground
truth. Today they describe Shadcn, Radix, React Flow, MSW, ESLint, Prettier,
Knip, Typedoc, Stylelint, Viper, Charmbracelet, mcp-go, OpenSearch,
OpenTelemetry and SSR — none of which are installed. An agent asked to build a
UI component will reach for Radix primitives that do not exist. Fixing the
documents costs a day; leaving them wrong taxes every future task.

## 3. Exit Criteria

- [ ] Every library named in `tech-stack.md` appears in a committed manifest,
      verified by an automated check.
- [ ] Every architectural mechanism described in the present tense in
      `architecture.md` can be traced to a file path.
- [ ] Each deliberate deviation from the original design has an ADR recording
      the decision, the reason, and the milestone that would revisit it.
- [ ] `roadmap.md` links every unbuilt capability to the milestone that owns it.
- [ ] A `spec-drift` CI check fails when a dependency is added without a
      corresponding `tech-stack.md` entry.

## 4. Scope

**In Scope**: `tech-stack.md`, `architecture.md`, `roadmap.md`, new ADRs,
`AGENTS.md`, `AGENTIC_SYSTEM.md`, `README.md`, the drift check.

**Out of Scope**: implementing any of the missing technology — each is owned by
a later milestone and must be referenced, not built, here.

## 5. Task Breakdown

- [x] **M02-T01** — Rewrite `tech-stack.md` from the actual manifests. Split into
      "In Use" (traceable to a manifest) and "Planned" (with the owning milestone id).
      - Files: `.specs/product/tech-stack.md`
      - Verify: every "In Use" entry is greppable in `package.json` / `go.mod`.

- [x] **M02-T02** — Rewrite `architecture.md` so present-tense statements describe
      the built system. Move CQRS/OpenSearch, in-process transport, OTel, SSR and
      React Flow into a "Planned Architecture" section citing M07/M08/M09/M11.
      - Files: `.specs/product/architecture.md`
      - Verify: each present-tense mechanism cites a file path.

- [x] **M02-T03** — Write ADRs for the deviations already made:
      oxlint in place of ESLint+Prettier; `LIKE` search in place of FTS5 until M07;
      no OpenSearch before measured need; Pino counters in place of OTel until M11;
      hand-rolled components in place of Shadcn/Radix (with the M06 revisit).
      - Files: `.specs/adr/ADR-0003…ADR-0007.md`
      - Verify: `architecture.md` links each ADR.

- [x] **M02-T04** — Add a `spec-drift` script comparing declared dependencies
      against `tech-stack.md`, wired into `moon check` and CI.
      - Files: `scripts/spec-drift.ts`, `moon.yml`, `.github/workflows/ci.yml`
      - Verify: adding a dependency without documenting it fails the check.

- [ ] **M02-T05** — Reconcile `NAVIGATION.md` with the routes that exist after M01,
      and mark breadcrumb and nested-context rules as M06-owned.
      - Files: `.specs/design/NAVIGATION.md`
      - Verify: every route in the mermaid map exists in `App.tsx`.

- [ ] **M02-T06** — Correct the claims in `README.md` about the standalone bundle
      and real-time GUI; point both at their owning milestones.
      - Files: `README.md`
      - Verify: no README claim contradicts observable behaviour.

- [ ] **M02-T07** — Run `/standards-index` to rebuild `index.yml` and confirm the
      milestone standard is registered.
      - Files: `.specs/standards/index.yml`
      - Verify: index lists every file present in `.specs/standards/`.

## 6. Verification

```bash
bun run scripts/spec-drift.ts
moon check --all
```

## 7. Risks

The temptation is to "fix" the specs by implementing the missing technology.
Resist it — that work is scoped into later milestones and doing it here makes
this milestone unbounded. If a claim is contentious, record the disagreement in
an ADR rather than deleting it silently.
