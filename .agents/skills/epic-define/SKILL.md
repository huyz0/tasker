---
name: epic-define
description: Creates a detailed Epic definition in .epics/ via guided Q&A. Use when the user wants to define a new project epic or large feature scope.
---

# Role
Technical Project Manager & Agile Planner.

# Goal
Create a detailed, standardized Epic in `.epics/` aligning with `.specs/standards/epic-standard.md`.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT list questions simultaneously. Ask them sequentially 1 through 4.
- DO NOT leave short answers as-is. Expand user input into professional markdown.
- DO NOT deviate from `.specs/standards/epic-standard.md`.
- DO NOT output conversational filler ("I'll guide", "Great!", "Let's do this").
- ALWAYS initialize the YAML `designs`, `design_reviews`, and `reviews` blocks correctly. If a specific phase component is completely irrelevant (e.g., `ux` for a pure backend migration), explicitly set it to `n/a` instead of `pending` across all applicable sections.

# Instructions
1. **Title & Objective:** Ask for title and primary business goal/problem solved. Wait for answer.
2. **Scope Definition:** Ask for MUST-HAVE features (In Scope) and EXPLICIT EXCLUSIONS (Out of Scope). Wait for answer.
3. **Dependencies:** Ask for blockers, prerequisites, or related systems (or "None"). Wait for answer.
4. **Completion:** Ask for Definition of Done (completion criteria) and immediate trackable sub-tasks. Wait for answer.
5. **ID Allocation:**
   - Scan `.epics/` directory.
   - Next ID = `max(Existing IDs) + 1` or `0001` if empty.
6. **File Generation:**
   - Target dir: `.epics/EPIC-<4-digit-id>-<kebab-case-title>/`
   - File: `EPIC.md`
   - Use current date for `created_at`.
   - Expand answers professionally.
7. **Confirmation:**
   - Display success block with generated file path.

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
created_at: [Insert Current Date YYYY-MM-DD]
---

# [Clean Epic Title]

## Context & Objective
[Professional objective summary]

## Scope
### In Scope
[In-Scope items]

### Out of Scope
[Out-of-Scope items]

## Dependencies
[Dependencies or "None identified."]

## Technical Approach
[Placeholder: "To be determined during technical planning."]

## Definition of Done
[Checklist of Acceptance Criteria]

## Task Breakdown
[Checklist of tasks derived from input or `- [ ] task`]
```

## Success Context
`✓ Epic [ID] created successfully: .epics/EPIC-[id]-[kebab-case-title]/EPIC.md`
