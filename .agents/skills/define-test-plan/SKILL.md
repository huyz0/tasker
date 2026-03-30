---
name: define-test-plan
description: Define Test Plan
---

# Define Test Plan

Create a highly detailed Test Plan inside the `.test-plans` folder based on user input, ensuring strict alignment with our testing standard.

## Important Guidelines

- **Always use AskUserQuestion tool** when asking the user anything.
- **Ask sequentially** — guide the user systematically; do not dump massive blocks of questions.
- **Offer guidance** — if a user provides a brief answer (e.g., just one test case), try to infer and suggest more robust ones based on their context.
- **Follow the standard** established in `.specs/standards/test-plan-standard.md`.

## Process

### Step 1: Core Details

Ask the user:

```
Let's build a new Test Plan.

**1. Context:**
What is the title of this Test Plan, and what specific Epic ID (e.g. EPIC-0001) or feature is it validating?
```

### Step 2: Determine Testing Scope

After they respond, ask the user:

```
**2. Scope Definition:**
What functionalities and user-flows are crucially **In Scope** for this testing phase? Also, what are we explicitly leaving **Out of Scope** right now?
```

### Step 3: Strategy & Environment setup

After they respond, ask the user:

```
**3. Test Strategy:**
How will we test this? (e.g., Heavy backend unit testing, Playwright E2E UI testing, or some manual exploratory checks). Do we need any specific test data (like a seeded database) before running these tests?
```

### Step 4: Core Test Cases

After they respond, ask the user:

```
**4. Test Cases:**
Can you describe 2 or 3 critical Test Cases I should record? (e.g., "Login success", "Validation error when password is short"). I will expand them into a proper Given/When/Then format for the document.
```

### Step 5: Determine Test Plan ID & Generate Files

1. Check the `.test-plans/` directory for existing test plans to determine the next available ID (e.g., if `TEST-PLAN-0001...` exists, the next is `0002`). If the `.test-plans/` directory doesn't exist or is empty, start with `0001`.
2. Format the title into a kebab-case string (e.g., "User Auth" -> `user-auth`).
3. Create a folder named `TEST-PLAN-<id>-<kebab-case-title>` inside `.test-plans/`. Ensure the ID is zero-padded to 4 digits (e.g. `0001`).
4. Assemble the answers into a highly professional Markdown document. Use the current date for `created_at`. If the user provided brief test cases, flesh them out thoughtfully into the TC-XXX Given/When/Then format.

Create the `TEST-PLAN.md` file inside the new folder using the following meticulous format:

```markdown
---
status: draft
title: [Insert Clean Title]
epic_link: [Insert Epic ID or "None"]
author: [Prompt User or Auto]
created_at: [Insert Current Date YYYY-MM-DD]
---

# [Insert Clean Title]

## Context & Objective
[Insert professional summary from Step 1]

## Scope of Testing
### In Scope
[List items from Step 2]

### Out of Scope
[List items from Step 2]

## Test Strategy & Environment
[Insert summary of the methodology and data needs from Step 3]

## Test Cases

### TC-001: [First distinct test case]
- **Type**: [Auto/E2E/Unit/Manual based on context]
- **Given**: ...
- **When**: ...
- **Then**: ...

### TC-002: [Second distinct test case]
- **Type**: ...
- **Given**: ...
- **When**: ...
- **Then**: ...

*(Add more TC items based on the discussion)*
```

### Step 6: Confirm Completion

After creating the file, output to the user:

```
✓ Test Plan [ID] created successfully:

  .test-plans/TEST-PLAN-[id]-[kebab-case-title]/TEST-PLAN.md

The comprehensive test skeleton is complete. You can now use this document to track QA progress alongside development!
```
