---
name: define-epic
description: Define Epic
---

# Define Epic

Create a highly detailed Epic inside the `.epics` folder based on user input, ensuring alignment with the robust project Epic standard.

## Important Guidelines

- **Always use AskUserQuestion tool** when asking the user anything.
- **Ask sequentially** — guide the user through the questions step-by-step; do not overwhelm them with a massive wall of questions.
- **Offer guidance** — if the user gives a brief answer, expand it into a professional format for the markdown document.
- **Follow the standard** established in `.specs/standards/epic-standard.md`.

## Process

### Step 1: Gather Context & Objective

Ask the user:

```
Let's define a new Epic. I'll guide you through making a robust specification.

**1. Title & Objective:**
What is the title of the Epic, and what is the primary business goal or problem it solves?
```

### Step 2: Determine Scope

After they respond, ask the user:

```
**2. Scope Definition:**
What are the **must-have** features for this Epic (In Scope), and crucially, what are we explicitly **excluding** (Out of Scope) to avoid scope creep?
```

### Step 3: Identify Dependencies

After they respond, ask the user:

```
**3. Dependencies:**
Are there any blockers, prerequisites, or other Epics/systems that need to be finished before or during this work? (If none, just say "None")
```

### Step 4: Establish the Definition of Done

After they respond, ask the user:

```
**4. Definition of Done & Tasks:**
How will we know this Epic is 100% complete? Please list the key completion criteria (e.g., testing milestones, feature sign-offs, documentation). We can also list any immediate sub-tasks you want to track.
```

### Step 5: Determine Epic ID & Generate Files

1. Check the `.epics/` directory for existing epics to determine the next available ID (e.g., if `EPIC-0001...` exists, the next is `0002`). If the `.epics/` directory doesn't exist or is empty, start with `0001`.
2. Format the title into a kebab-case string (e.g., "User Authentication" -> `user-authentication`).
3. Create a folder named `EPIC-<id>-<kebab-case-title>` inside `.epics/`. Ensure the ID is zero-padded to 4 digits (e.g. `0001`).
4. Assemble the answers into a highly professional Markdown document. Use the current date for `created_at`. If the user didn't provide a specific task breakdown, create a starter checklist based on their Definition of Done.

Create the `EPIC.md` file inside the new folder using the following meticulous format:

```markdown
---
status: todo
title: [Insert Clean Epic Title]
owner: [Prompt User or leave blank for now]
created_at: [Insert Current Date YYYY-MM-DD]
---

# [Insert Clean Epic Title]

## Context & Objective
[Insert professional summary of the objective from Step 1]

## Scope
### In Scope
[List In-Scope items from Step 2]

### Out of Scope
[List Out-of-Scope items from Step 2]

## Dependencies
[List dependencies from Step 3, or state "None identified."]

## Technical Approach
[Leave a placeholder if not discussed, e.g., "To be determined during technical planning."]

## Definition of Done
[Checklist of Acceptance Criteria from Step 4]

## Task Breakdown
[Checklist of tasks derived from user input or left as placeholders `- [ ] task`]
```

### Step 6: Confirm Completion

After creating the file, output to the user:

```
✓ Epic [ID] created successfully:

  .epics/EPIC-[id]-[kebab-case-title]/EPIC.md

The comprehensive template is ready. You can now tweak the file directly to refine the technical approach or add tasks!
```
