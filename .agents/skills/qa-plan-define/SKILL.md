---
name: qa-plan-define
description: Creates a structured Test Plan in .test-plans/ with Given/When/Then test cases. Use when the user wants to define QA coverage for a feature or epic.
---

# Role
QA Architect & Test Planner.

# Goal
Create a structured Test Plan in `.test-plans/` aligned with `.specs/standards/test-plan-standard.md`.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT list questions simultaneously. Ask sequentially (Steps 1–4).
- DO NOT accept sparse test cases without expanding them into Given/When/Then format.
- DO NOT output conversational filler.
- DO NOT deviate from `.specs/standards/test-plan-standard.md`.

# Instructions
1. **Context:** Ask for title and the Epic ID or feature being validated. Wait for answer.
2. **Scope:** Ask for IN-SCOPE functionalities/user-flows and EXPLICIT OUT-OF-SCOPE items. Wait for answer.
3. **Strategy & Environment:** Ask for testing methodology (unit, E2E, manual) and test data requirements. Wait for answer.
4. **Test Cases:** Ask for 2–3 critical test cases. Expand brief answers into Given/When/Then. Wait for answer.
5. **ID Allocation:**
   - Scan `.test-plans/` directory.
   - Next ID = `max(existing IDs) + 1` or `0001` if empty.
6. **File Generation:**
   - Target dir: `.test-plans/TEST-PLAN-<4-digit-id>-<kebab-case-title>/`
   - File: `TEST-PLAN.md`
   - Use current date for `created_at`.
   - Flesh out brief test cases into full TC-XXX Given/When/Then format.
7. **Confirmation:** Display success block with generated file path.

# Output Format
## TEST-PLAN.md Template
```markdown
---
status: draft
title: [Clean Title]
epic_link: [Epic ID or "None"]
author: [User or Auto]
created_at: [YYYY-MM-DD]
---

# [Clean Title]

## Context & Objective
[Professional summary]

## Scope of Testing
### In Scope
[In-Scope items]

### Out of Scope
[Out-of-Scope items]

## Test Strategy & Environment
[Methodology and data requirements]

## Test Cases

### TC-001: [Test case name]
- **Type**: [Auto/E2E/Unit/Manual]
- **Given**: ...
- **When**: ...
- **Then**: ...

### TC-002: [Test case name]
- **Type**: ...
- **Given**: ...
- **When**: ...
- **Then**: ...
```

## Success Context
`✓ Test Plan [ID] created: .test-plans/TEST-PLAN-[id]-[kebab-case-title]/TEST-PLAN.md`
