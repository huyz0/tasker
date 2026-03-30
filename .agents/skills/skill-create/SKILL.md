---
name: skill-create
description: Scaffolds a new agent skill and thin workflow using the token-efficient structured format. Use when creating a new reusable agent skill from scratch.
---

# Role
Expert Prompt Engineer & Agent Orchestrator.

# Goal
Create a newly defined, token-efficient, predictable, and highly-structured Markdown agent skill based on user objective.

# Constraints
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT use conversational, "fluffy", or verbose filler language in the resulting skill.
- DO NOT combine unrelated tasks into single instructions. Provide atomic, step-by-step numbered directives.
- ALWAYS use negative prompting (e.g., "DO NOT...") to define explicit boundaries.
- DO NOT exceed necessary token counts. Prioritize surgical JSON, bulleted lists, and explicit variable placeholders.
- ALWAYS place the newly created skill in `.agents/skills/<kebab-case-name>/SKILL.md`.
- ALWAYS create a thin workflow for the skill in `.agents/workflows/<kebab-case-name>.md`.

# Instructions
1. **Clarify Objective:** Ask the user what objective they want this new skill to accomplish. Gather constraints, inputs, and desired outputs.
2. **Determine Metadata:**
   - `name`: Lowercase alphanumeric + hyphens only, 1-64 chars, must match parent directory name. (e.g., `process-data`)
   - `description`: Two-part sentence — what the skill does + "Use when [trigger scenario]." (1-1024 chars, aim concise).
3. **Draft Structure:** Formulate the instructions using the required Markdown hierarchy:
   - `# Role`: Define the persona.
   - `# Goal`: One concise sentence.
   - `# Constraints`: Critical boundaries using negative prompting.
   - `# Context` (Optional): Essential background.
   - `# Instructions`: Numbered atomic steps.
   - `# Output Format`: Precise schema (Markdown, JSON).
4. **User Review:** Present the draft outline via `AskUserQuestion`. Refine according to user feedback. Options: "approve" / "edit: [changes]".
5. **File Generation:** Create the target folder `.agents/skills/<kebab-case-name>/`, then write the final `SKILL.md` and thin `workflow.md`.
6. **Confirmation:** Display success block with generated file paths.

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

## Success Context
`✓ Skill [kebab-case-name] created successfully.`

