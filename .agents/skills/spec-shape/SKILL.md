---
name: spec-shape
description: Gathers context and structures a plan for significant work into a spec folder. Use when in plan mode and the user wants to shape a feature or change before implementation.
---

# Role
Technical Planner & Spec Shaper.

# Goal
Gather context and structure a plan for significant work. Produces a spec folder in `.specs/specs/`.

# Constraints
- MUST be run in plan mode. If NOT in plan mode → stop and output: `Shape-spec must be run in plan mode. Enter plan mode first.`
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT over-document. Capture enough to start; refine during build.
- Task 1 of every plan MUST be "Save spec documentation".
- Standards guide but DO NOT dictate.

# Instructions

## Step 1: Clarify Scope
Ask: "What are we building? Describe the feature or change."

If scope is unclear, ask 1–2 follow-ups:
- "New feature or change to existing?"
- "Expected outcome when done?"
- "Constraints or requirements?"

## Step 2: Gather Visuals
Ask: "Do you have mockups, screenshots, or examples? (paste, share path, or 'none')"

Note provided visuals for spec folder.

## Step 3: Reference Implementations
Ask: "Similar code in this codebase to reference? (files, folders, features, or 'none')"

If provided → read and analyze to inform the plan.

## Step 4: Product Context
Check `.specs/product/` for `mission.md`, `roadmap.md`, `tech-stack.md`, `architecture.md`.

If exists → summarize relevant points, ask user to confirm alignment.
If missing → skip.

## Step 5: Surface Standards
Read `.specs/standards/index.yml`. Match relevant standards to the feature.

Present 2–5 suggestions via `AskUserQuestion`:
- Options: "yes" / "adjust: remove X, add Y"

Read confirmed standards files for plan context.

## Step 6: Generate Spec Folder Name
Format: `YYYY-MM-DD-HHMM-<feature-slug>/`
- Feature slug: lowercase, hyphens, max 40 chars.
- Create `.specs/specs/` if needed.

## Step 7: Structure Plan
Present plan structure with Task 1 = "Save spec documentation". Ask for confirmation.

## Step 8: Complete Plan
Build remaining implementation tasks informed by:
- Feature scope (Step 1)
- Reference patterns (Step 3)
- Standards constraints (Step 5)

Each task: specific and actionable.

## Step 9: Ready for Execution
Output: "Plan complete. Task 1 saves spec docs first, then implementation proceeds. Ready? (approve / adjust)"

# Output Format

## Spec Folder Structure
```
.specs/specs/{YYYY-MM-DD-HHMM-feature-slug}/
├── plan.md
├── shape.md
├── standards.md
├── references.md
└── visuals/
```

## shape.md
```markdown
# {Feature Name} — Shaping Notes
## Scope
[From Step 1]
## Decisions
- [Key decisions]
## Context
- **Visuals:** [List or "None"]
- **References:** [Code references]
- **Product alignment:** [Notes or "N/A"]
## Standards Applied
- [path] — [why it applies]
```

## standards.md
```markdown
# Standards for {Feature Name}
---
## [standard/path]
[Full standard content]
---
```

## references.md
```markdown
# References for {Feature Name}
## Similar Implementations
### {Reference Name}
- **Location:** `path/`
- **Relevance:** [Why relevant]
- **Key patterns:** [What to borrow]
```
