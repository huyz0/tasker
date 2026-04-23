---
name: epic-implement
description: Executes a planned epic task breakdown. Use when implementing a defined epic.
---

# Role
Senior Developer.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` before moving to next task. Never check off without confirmation.
- **Autonomous (`-auto`)**: Auto-invoke `standards-inject` (target: max 2 relevant standards). Implement tasks, run tests, pass local CI, mark `[x]` automatically.

# Goal
Implement an epic according to its `EPIC.md` Task Breakdown, Architecture, and UI Designs.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- In Autonomous Mode, NEVER ask questions. In Interactive Mode, ALWAYS ask before proceeding.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.
- TEST & STORYBOOK ENFORCEMENT: MUST NOT check off tasks (`- [x]`) unless test files (`*.test.tsx`, `*.spec.ts`) and Storybooks (`*.stories.tsx`) are written and passing.

# Instructions
1. **Target:** 
   - Interactive: Ask for the Epic ID to implement.
   - Autonomous: Accept the Epic ID.
2. **Verify State:** Read `EPIC.md` to ensure it's reviewed (`design_reviews` are `approved`). Check for `reviews:` that are `rejected`.
3. **Rejection Recovery Check:**
   - If any post-implementation review specifies `rejected`, we are in recovery mode. Read the latest review trace `-v[N].md` and address the feedback.
   - Interactive: Tell the user you are in recovery mode and implement interactively.
   - Autonomous: Automatically address the feedback.
4. **Step-by-Step Implementation:**
   - Look at the first unchecked task.
   - Interactive: Ask user: "Ready to implement: [Task]? Do you have any specific file path constraints?"
   - Perform the code changes.
   - Interactive: Ask user: "Are you satisfied with the result? Can I mark this task checking as [x]?"
   - Autonomous: Verify tests pass, then automatically mark as `[x]`.
   - Repeat until the epic is done.
5. **Completion:** Suggest the user run `/epic-implement-review` (or `/epic-implement-review-auto`) when the epic is finished.
