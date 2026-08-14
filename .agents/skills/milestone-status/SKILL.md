---
name: milestone-status
description: Reports delivery state — the active milestone, the task in flight, what the last session did, and what to run next. Verifies the recorded state against the repository and reports drift. Read-only. Use at the start of any session.
---

# Role

Delivery Reporter.

# Goal

Give a session that has no prior context everything it needs to continue, in
one short report, without changing anything.

# Constraints

- Follow `@.agents/protocols/work-ledger.md` to resolve the milestones path and state file.
- READ-ONLY. MUST NOT write, commit, or modify any file. If the recorded state is wrong, report the drift and recommend `/milestone-plan`; do not repair it here.
- MUST verify recorded state against reality rather than trusting `STATE.md`: count actual `- [x]` boxes, read actual frontmatter, read actual git state.
- MUST NOT run the test suite or any build. This skill is cheap by design.

# Instructions

1. **Resolve paths** from `.specs/product/work-ledger.yml`.
2. **Read** the state file, then every `MILESTONE.md` frontmatter.
3. **Count** checked and total tasks per milestone directly from the checkboxes.
4. **Read** the active milestone's `PROGRESS.md` last three entries.
5. **Inspect git**: current branch, whether the tree is dirty, the last five commit subjects.
6. **Detect drift** and report each instance:
   - Ledger counts in `STATE.md` disagreeing with the actual checkbox counts.
   - A milestone marked `done` with unchecked tasks or unchecked exit criteria.
   - A journal entry left `in-progress` with no later entry.
   - An uncommitted working tree (a resume hazard — the previous session violated the protocol).
   - An `active_milestone` whose dependencies are not `done`.
7. **Report** using the format below. If `blocked: true`, lead with the blocker.

# Output Format

```
DELIVERY STATUS

  Active:   M03 — IAM Correctness & Scale  [in-progress]
  Task:     M03-T07 — Honour the page field in the contract
  Branch:   feature/m03-iam-correctness-and-scale (clean)
  Progress: 6/14 tasks · 138 total across 12 milestones · 19 done

  Last session (2026-08-14):
    ✓ M03-T06 paginate listOrgMembers — backend:test 341 pass

  Milestones:
    ✓ M01 Stabilize the Build           13/13  done
    ✓ M02 Specification Truth            7/7   done
    ▸ M03 IAM Correctness & Scale        6/14  in-progress
      M04 Agent Identity                 0/12  todo (needs M03)
      …

  Drift: none

  Continue: /milestone-deliver M03
```

Report drift as explicit lines when present:

```
  Drift:
    ! STATE.md ledger says M03 5/14, actual count is 6/14
    ! working tree dirty — 3 files uncommitted from a prior session
```
