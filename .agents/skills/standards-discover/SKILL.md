---
name: standards-discover
description: Analyzes the codebase to extract tribal knowledge into documented standards. Use when the user wants to identify and formalize repeating patterns or conventions.
---

# Role
Codebase Analyst & Standards Documenter.

# Goal
Extract tribal knowledge from the codebase into concise, documented standards in `.specs/standards/`.

# Constraints
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT batch all questions upfront. Process one standard at a time: ask → draft → confirm → create.
- DO NOT write verbose prose. Standards are injected into AI context windows — every word costs tokens.
- ALWAYS lead with the rule, explain why second (if needed).
- ALWAYS use code examples over natural language descriptions.
- DO NOT combine unrelated patterns into one standard file.
- DO NOT document what the code already makes obvious.

# Writing Rules for Standards
- Bullet points over paragraphs.
- One standard per concept.
- Skip the obvious.
- Show (code), don't tell (prose).

# Instructions

## Step 1: Determine Focus Area
If area specified by user → skip to Step 2.

If not specified:
1. Analyze codebase structure (folders, file types, patterns).
2. Identify 3–5 major areas (e.g., API routes, database, components, auth, testing).
3. Ask user to pick one area. Wait for response.

## Step 2: Analyze & Present Findings
1. Read 5–10 representative files in the chosen area.
2. Identify patterns that are: **unusual**, **opinionated**, **tribal**, or **consistently repeated**.
3. Present findings as numbered list. Ask user which to document.
   - Options: "Yes, all" / "Just 1 and 3" / "Add: [suggestion]" / "Skip"
4. Wait for selection.

## Step 3: Ask Why, Then Draft (Per Standard — Full Loop)
For EACH selected standard, complete this cycle before moving to the next:
1. Ask 1–2 clarifying questions about the "why" behind the pattern.
2. Wait for response.
3. Draft the standard using Writing Rules above.
4. Present draft via `AskUserQuestion`. Options: "yes" / "edit: [changes]" / "skip".
5. Create/update file in `.specs/standards/[folder]/` if approved.

Applicable folders: `api/`, `database/`, `javascript/`, `css/`, `backend/`, `testing/`, `global/`

Check if related standard file exists first — append if so.

## Step 4: Update Index
1. Scan `.specs/standards/` for all `.md` files.
2. For each new file, propose a one-sentence index description via `AskUserQuestion`.
3. Update `.specs/standards/index.yml`:
   - Alphabetize folders, then files within folders.
   - File names without `.md` extension.
   - One-line descriptions.
   - `root` = files directly in `.specs/standards/` (not subfolder).

## Step 5: Offer to Continue
Ask if user wants to discover standards in another area or finish.

# Output Format
## Standard File
```markdown
# [Standard Name]

[Rule statement or code example]

- [Constraint 1]
- [Constraint 2]
```

## Index Entry (index.yml)
```yaml
folder-name:
  file-name:
    description: One-sentence description
```

## Completion
```
Standards created for [area]:
- [folder]/[file].md
- [folder]/[file].md
```
