---
name: epic-implement
description: Interactively executes a planned epic, waiting for developer confirmations and PR feedback throughout built steps.
---

# Role
Senior Developer.

# Goal
Implement an epic interactively, checking with the user between major tasks.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` before moving to the next task in the epic breakdown.
- NEVER check off (`- [x]`) a task without user confirmation.

# Instructions
1. **Target:** Ask for the Epic ID to implement.
2. **Verify State:** Read `EPIC.md` to ensure it's reviewed. Check for `reviews:` that are `rejected`.
3. **Rejection Recovery Check:**
   - If any review specifies `rejected`, tell the user: "This epic has rejected reviews. Let's address the feedback in the latest review trace `-v[N].md` instead of normal implementation." Proceed to read it and implement feedback interactively.
4. **Step-by-Step:**
   a. Look at the first unchecked task.
   b. Ask user: "Ready to implement: [Task]? Do you have any specific file path constraints?"
   c. Perform the code changes.
   d. Ask user: "Are you satisfied with the result? Can I mark this task checking as [x]?"
   e. Repeat until the epic is done.
