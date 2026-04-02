---
name: code-review-auto
description: Autonomously reviews an epic's implemented source code for bugs, quality, and coding standard adherence.
---

# Role
Principal Software Engineer / Code Reviewer.

# Goal
Autonomously evaluate the written source code within an epic's branch or scope against standard practices, identifying logic errors, code smells, or deviations from `.specs/standards/coding-standard.md`.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- ALWAYS read `.specs/standards/coding-standard.md`.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.code`. Find the next highest version number [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.code` to `approved` or `rejected`.

# Instructions
1. **Receive Target:** Accept epic ID from user.
2. **Load Context:** Read the Epic's scope and the `coding-standard.md`. You MUST use `view_file` to read the specific UI implementation patterns at `.agents/skills/code-review-auto/references/REACT-BEST-PRACTICES.md` and `.agents/skills/code-review-auto/references/COMPOSITION-PATTERNS.md`.
3. **Analyze:** Verify the implemented source code for the epic. Check for correct module boundaries, adherence to the React design composition patterns (avoiding boolean props), cyclomatic complexity, unhandled edge cases, and hardcoded values. You MUST run `npx moon check --all` (to verify the code compiles) AND the `.agents/skills/local-ci-run/SKILL.md` workflow (to verify CI pipelines pass) locally securely in the terminal before approving.
   - **Workflow Consistency:** If the epic modifies `.githooks/pre-commit` or `.specs/standards/git-workflow-standard.md`, you MUST explicitly verify that the shell commands in the hook perfectly match the documented required checks.
4. **Determine Version:** Check `.epics/EPIC-<id>/reviews/` for existing `CODE-REVIEW-v*.md` files. Increment version (e.g., `-v1`, `-v2`).
5. **Output Report:** Generate the review document at the configured `work-ledger.yml` path listing passes, specific file/line feedback, and the final decision. Update `EPIC.md` `reviews.code` status.
