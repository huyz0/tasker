---
name: standards-inject
description: Injects relevant coding standards into the current context for implementation, planning, or skill creation. Use when the user needs standards applied to their current work.
---

# Role
Standards Injector & Context Manager.

# Goal
Inject relevant standards into the current context, formatted for the active scenario.

# Constraints
- ALWAYS use `AskUserQuestion` when uncertain about scenario detection.
- DO NOT assume "Conversation" scenario by default — ask when ambiguous.
- DO NOT overwhelm with suggestions — keep to 2–5 relevant standards.
- `root` is a reserved keyword for files directly in `.specs/standards/` (no subfolder).

# Usage Modes

## Auto-Suggest Mode (no arguments)
Analyzes context, suggests relevant standards.

## Explicit Mode (with arguments)
```
/standards-inject api                          # All in api/
/standards-inject api/response-format          # Single file
/standards-inject api/response-format api/auth # Multiple
/standards-inject root                         # All root-level
/standards-inject root/naming                  # Single root file
```
Skips suggestion step. Still detects scenario.

# Instructions

## Step 1: Detect Scenario
Determine context from conversation:

| Signal | Scenario |
|--------|----------|
| Plan mode active OR mentions "spec", "plan", "shape" | **Shaping/Planning** |
| Mentions creating skill, editing `.agents/skills/` or `.agents/workflows/` | **Creating Skill/Workflow** |
| Neither clearly detected | **Ask user** (1=Conversation, 2=Skill/Workflow, 3=Plan) |

## Step 2: Read Index (Auto-Suggest only)
Read `.specs/standards/index.yml`.

If missing/empty → output: `No standards index found. Run /standards-discover or /standards-index first.`

## Step 3: Match & Suggest (Auto-Suggest only)
Analyze current work context (type, technologies, goal). Match against index descriptions.

Present 2–5 suggestions via `AskUserQuestion`:
- Options: "yes" / "just 1 and 3" / "add: [path]" / "none"

## Step 4: Inject by Scenario

### Conversation
Read and display full standard content:
```
--- Standard: [path] ---
[content]
--- End Standard ---
```
Append `**Key points:** [bullet summary]`.

### Skill/Workflow
Ask: References (1) or Copy content (2)?
- **References**: Output `@.specs/standards/[path]` file paths.
- **Copy**: Output full content inline.

### Shaping/Planning
Ask: References (1) or Copy content (2)?
- Same format as Skill/Workflow.

## Step 5: Surface Related Skills (Conversation only)
Check `.agents/skills/` and `.agents/workflows/` for related procedures. List but DO NOT auto-invoke.

## Explicit Mode Steps
1. Detect Scenario (same as above).
2. Parse arguments: folder → all `.md` in folder; folder/file → specific file.
3. Validate existence. If not found → show available options with "Did you mean?"
4. Inject by Scenario (same as above).

# Integration
Called internally by `/spec-shape`. Can also be invoked directly.
