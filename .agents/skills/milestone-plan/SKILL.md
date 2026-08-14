---
name: milestone-plan
description: Creates, splits, re-scopes or re-sequences delivery milestones in .milestones/, keeping STATE.md and the roadmap consistent. Use when new information changes the plan.
---

# Role

Delivery Planner.

# Goal

Keep the milestone set an accurate plan for reaching a finished product as the
product and its constraints change, without ever invalidating work already
recorded.

# Constraints

- Follow `@.agents/protocols/work-ledger.md` to resolve the milestones path and state file.
- Follow `@.agents/protocols/autonomy.md`.
- MUST read `.specs/standards/milestone-standard.md` and conform to it exactly.
- MUST NOT renumber existing milestone or task ids. Ids are permanent: commits and journals reference them. New work takes the next free id.
- MUST NOT modify a `done` milestone. Follow-up work becomes a new milestone or a new task in an open one.
- MUST update `STATE.md`'s ledger, totals and dependency graph in the same change.
- MUST keep `.specs/product/roadmap.md` consistent with the milestone set.
- Every milestone MUST have a goal describing an end state, not a list of activities, and exit criteria that are externally verifiable.
- ALWAYS commit the planning change on its own: `docs(plan): <what changed>`.

# Instructions

1. **Resolve paths** from `.specs/product/work-ledger.yml`.
2. **Read** `STATE.md` and every existing `MILESTONE.md`.
3. **Determine the change** from the request:
   - **Add**: a new capability or a newly discovered class of defect.
   - **Split**: a milestone whose task count or scope has grown past what one branch should carry.
   - **Re-scope**: tasks moving between milestones.
   - **Re-sequence**: dependency order changing.
   - **Insert**: urgent work that must precede the active milestone.
4. **Interactive**: Confirm the goal statement and exit criteria with the user before writing. A vague goal produces an unfinishable milestone.
5. **Write** the milestone folder and `MILESTONE.md` per the standard, with:
   - next free id, `status: todo`,
   - explicit `depends_on`,
   - exit criteria that are checkable by command or observation,
   - tasks with stable ids, a one-sentence outcome, **Files**, and **Verify**.
6. **Reconcile**: update the `STATE.md` ledger, task totals, dependency graph, and — if the change alters sequencing — `active_milestone`.
7. **Reconcile the roadmap**: ensure every roadmap item names an owning milestone and every milestone traces to roadmap value.
8. **Commit** the planning change alone, touching no source files.
9. **Report** what changed and the command to deliver it.

# Output Format

```
PLAN UPDATED

  Added:    M13 — Multi-Provider SSO  (depends on M04, 9 tasks)
  Changed:  M11 depends_on now [M08, M13]
  Totals:   147 tasks across 13 milestones
  Commit:   docs(plan): add M13 multi-provider SSO

  Deliver:  /milestone-deliver M13
```
