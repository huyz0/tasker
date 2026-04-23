---
name: epic-implement-review
description: Performs code, QA, architecture, and security reviews. Use when an epic implementation finishes.
---

# Role
Principal Release Manager & Comprehensive Code Reviewer.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` to discuss focus areas, struggles, deviations.
- **Autonomous (`-auto`)**: Auto-invoke `standards-inject` (target: max 2 standards). Evaluate strictly. Reject if ANY Medium/High/Critical finding.

# Goal
Perform a comprehensive post-implementation review covering Code Quality, QA Test Coverage, Architectural Compliance, and Security in a single pass.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS resolve review output paths and filename formats using `reviews.config.project_files.name_templates.*` in `work-ledger.yml`. Find the highest existing version [N] for each required review document.
- ALWAYS include YAML frontmatter in review artifacts: `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.*` fields to `approved` or `rejected`. If irrelevant (e.g. no architecture changes), mark `n/a`.
- In Autonomous Mode, NEVER ask questions. In Interactive Mode, ALWAYS ask questions.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.
- Automatically invoke `standards-inject` to dynamically load the 2 most relevant project standards (e.g., `coding-standard`, `security-standard`) based on the diff. Do NOT load product foundations.

# Instructions
1. **Target Identification:** 
   - Interactive: Ask for the Epic ID. Wait for answer. Ask which review phases they want to run. Ask about focus areas, specific struggles (e.g. mocking, auth), and any architectural deviations.
   - Autonomous: Accept the provided Epic ID from the context. Proceed immediately to analyze all applicable areas.
2. **Load Context:** Read the Epic's scope, the `TEST-PLAN.md`, and the `ARCHITECTURE.md`. Use `standards-inject` to load targeted standards.
3. **Comprehensive Analysis (Single Pass):** Analyze the git diff of the implementation for:
   - **Code Quality**: Cyclomatic complexity, edge cases, completeness against Task Breakdown and Definition of Done, missing Storybook stories. No hardcoded mocks.
   - **QA Coverage**: Compare implemented tests against `TEST-PLAN.md`.
   - **Architectural Drift**: Compare implementation against `ARCHITECTURE.md` decisions.
   - **Security**: Scan for vulnerabilities, authentication gaps, and data exposure based on `security-standard.md`.
4. **Local CI Verification:** Run the `.agents/skills/local-ci-run/SKILL.md` skill to safely test GitHub workflows locally. A review cannot be fully approved if CI fails.
5. **Output Reports:** 
   - Generate combined or separate review documents at the configured `work-ledger.yml` paths based on the `name_templates` for `code`, `qa_implement`, `architecture_code`, and `security`.
   - Update `EPIC.md` `reviews.*` status.
   - For Autonomous mode, findings MUST be output in a deterministic YAML format directly within the Markdown (no tables), detailing `file`, `line`, `severity`, and `comment`.
   - Output a combined health summary of the generated review documents, explicitly including the CI run results.
