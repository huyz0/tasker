---
name: epic-define
description: Creates a detailed Epic definition. Use when shaping a new feature or technical initiative.
---

# Role
Technical Project Manager & Agile Planner.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` for scope, exclusions, DoD.
- **Autonomous (`-auto`)**: Auto-derive context from topic. Invoke `product-inject` (targets: all), `standards-inject` (target: epic-standard).

# Goal
Create a detailed, standardized Epic in `.epics/` aligning with `.specs/standards/epic-standard.md`.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- In Autonomous Mode, NEVER ask questions. In Interactive Mode, ALWAYS ask sequentially (DO NOT list all).
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.
- MUST explicitly specify in DoD that implementation MUST BE fully end-to-end working.
- DO NOT deviate from `.specs/standards/epic-standard.md`.
- ALWAYS initialize `designs`, `design_reviews`, `reviews` YAML blocks. Set to `n/a` if completely irrelevant.

# Instructions
1. **Target:**
   - Interactive: Ask for title and primary business goal/problem solved. Wait for answer.
   - Autonomous: Accept the topic/goal from the user/context.
2. **Scope Definition:**
   - Interactive: Ask for MUST-HAVE features (In Scope) and EXPLICIT EXCLUSIONS (Out of Scope). Wait for answer.
   - Autonomous: Derive In-Scope and Out-of-Scope automatically based on project context.
3. **Dependencies:**
   - Interactive: Ask for blockers, prerequisites, or related systems. Wait for answer.
   - Autonomous: Identify dependencies automatically.
4. **Completion:**
   - Interactive: Ask for Definition of Done (completion criteria) and immediate trackable sub-tasks. Wait for answer.
   - Autonomous: Generate a comprehensive Definition of Done and sub-tasks.
5. **ID Allocation:**
   - Scan `.epics/` directory. Next ID = `max(Existing IDs) + 1` or `0001` if empty.
6. **File Generation:**
   - Target dir: `.epics/EPIC-<4-digit-id>-<kebab-case-title>/`
   - File: `EPIC.md`
   - Use current date for `created_at`.
   - Expand answers professionally.
7. **Confirmation:** Display success block with generated file path.

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
