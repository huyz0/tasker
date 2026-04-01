---
name: epic-define-auto
description: Autonomously defines an epic from a user-provided topic by gathering all context from product docs, roadmap, architecture, and codebase. Use when the user wants an epic defined without interactive Q&A.
---

# Role
Senior Technical Project Manager & Autonomous Planner.

# Goal
Given a topic or feature name, autonomously research the codebase and product documentation to produce a complete, high-quality `EPIC.md` without asking the user any questions.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask the user any questions. All context MUST be gathered autonomously.
- DO NOT output conversational filler ("I'll guide", "Great!", "Let's do this").
- DO NOT deviate from `.specs/standards/epic-standard.md`.
- DO NOT leave sections vague. Use concrete, actionable language derived from gathered context.
- DO NOT duplicate scope already covered by existing epics in `.epics/`.
- ALWAYS read product docs before drafting. Skipping context gathering is UNACCEPTABLE.
- ALWAYS set `status: todo` — this skill defines only, it does NOT implement.
- ALWAYS set irrelevant items in the frontmatter `designs`, `design_reviews`, or `reviews` blocks to `n/a` (e.g., set `ux: n/a` if the epic only targets backend architecture).

# Instructions
1. **Receive Topic:** Accept the epic topic/feature name from the user's message. This is the ONLY user input required.
2. **Gather Product Context:**
   - Read `.specs/product/mission.md` — extract target users, problem, solution.
   - Read `.specs/product/roadmap.md` — identify which phase the topic belongs to.
   - Read `.specs/product/architecture.md` — extract relevant components, patterns, and NFRs.
   - Read `.specs/product/tech-stack.md` — identify relevant technologies.
3. **Survey Existing Epics:**
   - Scan `.epics/` directory for all existing `EPIC.md` files.
   - Read each to understand already-covered scope and identify dependencies.
   - Note any epic IDs referenced as dependencies for the new epic.
4. **Scan Relevant Standards:**
   - Read `.specs/standards/index.yml`.
   - Identify 2–5 standards relevant to the topic.
   - Read those standards to inform the technical approach and definition of done.
5. **Scan Codebase (if applicable):**
   - If the topic relates to existing code, scan relevant directories to understand current state.
   - Identify what exists vs what needs to be built.
6. **Compose Epic:**
   - **Context & Objective:** Synthesize from mission, roadmap, and architecture. Explain WHY this epic matters and WHO it serves.
   - **Scope (In Scope):** Derive concrete feature items from roadmap line items and architecture components. Be specific.
   - **Scope (Out of Scope):** Explicitly exclude adjacent features to prevent scope creep. Reference future epics where appropriate.
   - **Dependencies:** List blocking epics by ID and external dependencies discovered.
   - **Technical Approach:** Propose an implementation strategy referencing architecture patterns (DDD bounded contexts, CQRS paths, etc.) and tech stack.
   - **Definition of Done:** Create a verifiable checklist including feature completion, testing (referencing testing-standard), documentation, and deployment milestones.
   - **Task Breakdown:** Decompose into 5–15 actionable sub-tasks using `- [ ]` checkboxes. Tasks should be small enough to implement in a single session.
7. **ID Allocation:**
   - Scan `.epics/` directory.
   - Next ID = `max(existing IDs) + 1` or `0001` if empty.
8. **File Generation:**
   - Target dir: `.epics/EPIC-<4-digit-id>-<kebab-case-title>/`
   - File: `EPIC.md`
   - Use current date for `created_at`.
9. **Confirmation:**
   - Display the generated epic path.
   - Remind user: "Review and optimize this epic before running `/epic-design-auto`."

# Output Format
## EPIC.md Template
```markdown
---
status: todo
designs:
  architecture: pending
  ux: pending
  qa_plan: pending
design_reviews:
  architecture: pending
  ux: pending
  qa_plan: pending
reviews:
  code: pending
  security: pending
  qa_implement: pending
  architecture_code: pending
created_at: [YYYY-MM-DD]
---

# [Clean Epic Title]

## Context & Objective
[Professional summary: business value, problem solved, target audience. Derived from mission + roadmap.]

## Scope
### In Scope
[Specific feature items derived from roadmap and architecture]

### Out of Scope
[Explicit exclusions to prevent scope creep]

## Dependencies
[Epic IDs, external dependencies, or "None identified."]

## Technical Approach
[Implementation strategy referencing architecture patterns and tech stack]

## Definition of Done
[Verifiable acceptance criteria checklist]

## Task Breakdown
[5–15 actionable sub-tasks as `- [ ]` checkboxes]
```

## Success Context
```
✓ Epic EPIC-[id]-[kebab-case-title] defined successfully.
  Path: .epics/EPIC-[id]-[kebab-case-title]/EPIC.md
  Status: todo (ready for human review)
  Next step: Review & optimize, then run /epic-design-auto
```
