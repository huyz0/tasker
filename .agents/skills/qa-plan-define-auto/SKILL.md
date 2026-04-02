---
name: qa-plan-define-auto
description: Autonomously maps out and generates a comprehensive test plan for a given Epic, deriving all context and test cases directly from the Epic's scope and acceptance criteria.
---

# Role
Senior QA Architect & SDET.

# Goal
Given an epic identifier, autonomously parse the epic's requirements, determine the testing strategy, and output a complete, standardized `TEST-PLAN.md` document containing explicit Given/When/Then test cases.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask the user any questions. All context MUST be gathered autonomously.
- DO NOT invent test cases for items explicitly "Out of Scope" in the epic.
- DO NOT deviate from `.specs/standards/test-plan-standard.md`.
- ALWAYS output files into a subdirectory exactly formatted as .test-plans/TEST-PLAN-<4-digit-id>-<kebab-case-title>/. DO NOT use the epic's folder name format.
- ALWAYS tag test cases clearly with `TC-XXX`.
- ALWAYS align the test cases directly against the epic's "Definition of Done".
- ALWAYS ensure every frontend UI flow has an E2E test case and every backend change has a Unit/Integration case.

# Instructions
1. **Receive Target:** Accept the epic identifier (e.g., `EPIC-0002` or full path).
2. **Load Context:**
   - Read the target `EPIC.md` fully to extract In Scope features, Out of Scope limits, and Definition of Done.
   - Read `.specs/standards/test-plan-standard.md` to ensure correct formatting and constraints.
   - Read `.specs/standards/testing-standard.md` (if it exists) for platform-specific testing strategies (e.g., Vitest vs Playwright).
3. **Plan Scope & Strategy:**
   - Determine what needs purely Unit Tests vs broad E2E Automation based on the tech-stack and architecture.
   - Identify how test data should be seeded or mocked for this epic.
4. **Derive Test Cases:**
   - For each major feature or Definition of Done checkbox, create at least one positive ("happy path") and one negative ("error state") test case.
   - Format every test case strictly using the BDD `Given / When / Then` structure.
   - Use sequential IDs (`TC-001`, `TC-002`, etc).
5. **ID Allocation & Folder Creation:**
   - Scan `.test-plans/` directory to find the highest existing `TEST-PLAN` ID.
   - Next ID = `max(existing IDs) + 1` or `0001` if empty.
6. **Generate Document:**
   - Target dir: `.test-plans/TEST-PLAN-<4-digit-id>-<epic-kebab-title>/`
   - File: `TEST-PLAN.md`
   - Set YAML metadata: `status: draft`, `epic_link: EPIC-<id>`, `author: Auto`, and current date.
7. **Confirmation:**
   - Output the generated file path.
   - Remind user: "Review this test plan before running `/epic-design-review-auto`."

# Output Format
## TEST-PLAN.md Template
```markdown
---
status: draft
title: "[Epic Title] Validation"
epic_link: EPIC-<id>
author: Auto
created_at: [YYYY-MM-DD]
---

# [Epic Title] Validation

## Context & Objective
[Explanation of how this plan validates the specific Epic, referencing its main business goal.]

## Scope of Testing
### In Scope
[List extracted from epic's In Scope]

### Out of Scope
[List extracted from epic's Out of Scope]

## Test Strategy & Environment
- **Unit/Integration**: [Which pieces need unit tests]
- **E2E Critical Path**: [Which UI flows need browser automation]
- **Data/Mocking Needs**: [What state must exist before tests run]

## Test Cases

### TC-001: [Test case name]
- **Type**: [Unit | Integration | E2E]
- **Given**: [Precondition or starting state]
- **When**: [Action taken by user or system]
- **Then**: [Expected verifiable outcome]

### TC-002: [Test case name]
- **Type**: [Unit | Integration | E2E]
- **Given**: [Precondition]
- **When**: [Action]
- **Then**: [Outcome]

[... additional cases covering the Definition of Done ...]
```

## Success Context
```
✓ Auto Test Plan created for EPIC-[id].
  Path: .test-plans/TEST-PLAN-[id]-[title]/TEST-PLAN.md
  Cases: [count] Given/When/Then scenarios defined.
  Status: draft (ready for human review)
```
