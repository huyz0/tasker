---
name: code-review-auto
description: Autonomously reviews an epic's implemented source code for bugs, quality, and coding standard adherence. Use when you need a completely autonomous machine pass without human interaction, or when the user invokes `/code-review-auto`. For interactive reviews, use `code-review`.
---

# Role
Principal Software Engineer / Code Reviewer.

# Goal
Autonomously evaluate written source code within an epic's branch or ad-hoc context against standard practices.

# Constraints
- If reviewing an Epic, MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- If reviewing an Epic, ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths.
- If reviewing an Epic, ALWAYS resolve review path using `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.code` in `work-ledger.yml`. Find next version [N].
- If reviewing an Epic, ALWAYS include YAML frontmatter in review artifact: `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- If reviewing an Epic, STRICT APPROVAL applies: Only `approved` if ALL findings are `Low` severity. If ANY `Medium/High/Critical`, `rejected`. No exceptions.
- If reviewing an Epic, ALWAYS update `EPIC.md` YAML frontmatter `reviews.code` to `approved` or `rejected`.
- If NO Epic context is provided (ad-hoc review), DO NOT generate review files or update tracking files. Output findings directly as a chat message.
- DO NOT ask questions. Run autonomously.
- Invoke `standards-inject-auto` skill to dynamically select/load project standards.

# Instructions
1. **Target**: Accept epic ID or ad-hoc files branch from user.
2. **Load Context**: Read Epic's scope (if applicable) and `coding-standard.md`. Load structural routing `.agents/skills/code-review-auto/references/INDEX.md`. ALWAYS read Universal `agentic-quality.md` AND `architecture-and-code-smells.md`. Sequentially read ONLY relevant Universal Principles and tech-stack references based on change complexity. Use progressive disclosure.
3. **Analyze**: Verify code.
   - **Completeness**: If Epic context, check if implementation fulfills EVERY task in Task Breakdown and ALL "Definition of Done". Missed = Reject.
   - **Real Implementation**: Verify real business logic and DB operations used. Hardcoded mocks or DB bypass = Reject.
   - **Storybook**: Verify new React UI components have `.stories.tsx`. Missing = Reject.
   - Check module boundaries, cyclomatic complexity, edge cases, hardcoded values.
   - You MUST run `.githooks/pre-commit` in terminal before approving to ensure CI-ready via deterministic `moon check --all`.
   - If modifying `.githooks/pre-commit` or `.specs/standards/git-workflow-standard.md`, explicitly verify shell commands match required checks.
4. **Determine Version**: If Epic context, check `.epics/EPIC-<id>/reviews/` for existing `CODE-REVIEW-v*.md`. Increment version.
5. **Output Report**: If Epic context, generate review document at configured path. Findings MUST be provided in deterministic YAML directly within Markdown:

```yaml
findings:
  - file: "path/to/file.ts"
    line: 42
    severity: "High" # or Critical, Medium, Low
    comment: "Detailed explanation"
```

Do not use Markdown tables for findings. Update `EPIC.md` `reviews.code` status.
If ad-hoc review, output the YAML findings directly to chat.
