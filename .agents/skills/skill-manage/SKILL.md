---
name: skill-manage
description: Creates new or refactors existing agent skills into structured Markdown. Use when scaffolding a new skill or compressing an existing verbose skill.
---

# Role
Expert Prompt Engineer & Agent Orchestrator.

# Execution Mode
- **Create**: Scaffolds a brand new skill from scratch.
- **Optimize**: Refactors an existing verbose/fluffy skill into strict, token-efficient Markdown.

# Goal
Produce highly-structured, predictable, and token-efficient Markdown agent skills.

# Constraints
- ALWAYS use `AskUserQuestion` for inquiries.
- DO NOT use conversational, "fluffy", or verbose filler language in the resulting skill.
- DO NOT combine unrelated tasks into single instructions. Provide atomic, step-by-step numbered directives.
- ALWAYS use negative prompting (e.g., "DO NOT...") to define explicit boundaries.
- DO NOT exceed necessary token counts. Prioritize surgical JSON, bulleted lists, and explicit placeholders.
- ALWAYS place the final skill in `.agents/skills/<kebab-case-name>/SKILL.md`.
- ALWAYS create a thin workflow for the skill in `.agents/workflows/<kebab-case-name>.md`.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.

# Instructions

## 1. Determine Target
Prompt `AskUserQuestion` to ask if creating a NEW skill or OPTIMIZING an existing one.

## 2. Context Gathering
- **If Create**: Ask user for objective, constraints, inputs, and desired outputs.
- **If Optimize**: Ask user for target skill path. Read it. Identify the true objective, constraints, step-by-step logic, and required outputs. Eliminate conversational text and subjective descriptions.

## 3. Draft Metadata & Structure
Draft the skill using the exact template schema:
- `name`: Lowercase alphanumeric + hyphens only, 1-64 chars.
- `description`: Two-part sentence — "What it does. Use when [trigger]."
- `# Role`: Define the persona.
- `# Goal`: One concise sentence.
- `# Constraints`: Critical boundaries using negative prompting.
- `# Instructions`: Numbered atomic steps.
- `# Output Format`: Precise schema (Markdown, JSON).

## 4. User Review
Present the draft outline via `AskUserQuestion`. Refine according to user feedback. Options: "approve" or "edit: [changes]".

## 5. File Generation
- Create folder `.agents/skills/<kebab-case-name>/` (if new).
- Write `SKILL.md`.
- Write thin `.agents/workflows/<kebab-case-name>.md`.

## 6. Confirmation
Output success block with generated file paths.

# Output Format
## SKILL.md Template
```markdown
---
name: [kebab-case-name]
description: [What it does. Use when trigger scenario.]
---

# Role
[Persona]

# Goal
[Concise goal]

# Constraints
- [Negative constraints]
- [Boundaries]

# Instructions
1. [Step 1]
2. [Step 2]

# Output Format
[Output schema]
```

## Workflow Template (.agents/workflows/<kebab-case-name>.md)
```markdown
---
description: [Title Case Description]
---

# [Title Case Description]
**Delegate**: `.agents/skills/[kebab-case-name]/SKILL.md`
**Action**: Read and execute standard instructions exactly.
```
