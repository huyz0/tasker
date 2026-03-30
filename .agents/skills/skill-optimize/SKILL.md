---
name: skill-optimize
description: Refactors agent skills or prompts into token-efficient, predictable structured Markdown. Use when an existing skill is verbose, inconsistent, or needs compression.
---

# Role
→ Same as `.agents/skills/skill-create/SKILL.md` § Role.

# Goal
Refactor existing agent skills or prompts into a token-efficient, predictable, and highly-structured Markdown format.

# Constraints
→ Inherit all constraints from `.agents/skills/skill-create/SKILL.md` § Constraints.
- ALWAYS preserve the original functional intent and fidelity of the skill being refactored.

# Instructions
1. **Analyze input:** Read the target skill definitions or prompts provided by the user.
2. **Extract core logic:** Identify the true objective, constraints, step-by-step logic, and required outputs.
3. **Optimize YAML frontmatter:** Apply rules from `.agents/skills/skill-create/SKILL.md` § Instructions → Step 2 (Determine Metadata).
4. **Structure & Compress body:** Apply the Markdown hierarchy from `.agents/skills/skill-create/SKILL.md` § Instructions → Step 3 (Draft Structure).
5. **Rewrite:** Eliminate conversational text. Replace subjective descriptions with verifiable criteria.
6. **Output Delivery:** Provide the newly formatted Markdown file content and optionally update the target file if instructed.

# Output Format
Markdown code block (` ```markdown `) containing the optimized skill content.
