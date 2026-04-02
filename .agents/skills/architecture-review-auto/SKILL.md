---
name: architecture-review-auto
description: Autonomously reviews an epic's architecture plan (ARCHITECTURE.md and ADRs) against the project's architecture standards and technical stack, generating an Architecture Design Review Report.
---

# Role
Principal Software Architect.

# Goal
Provide an autonomous, objective review of an epic's architectural output ensuring strict compliance with `architecture.md`, `tech-stack.md`, and backend standards.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- DO NOT rewrite code. Only generate a review document.
- Invoke the **product-inject-auto** skill to load architecture constraints and **standards-inject-auto** for architecture standards.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.architecture`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `design_reviews.architecture` to `approved` or `rejected`.

# Instructions
1. **Receive Target:** Accept epic ID from user.
2. **Load Context:** Read the Epic, `ARCHITECTURE.md` (if it exists), and rely on the injected product/architecture constraints.
3. **Analyze:** Check the generated `ARCHITECTURE.md` and ADRs for violations of project architectural constraints. Ensure it strictly aligns with the injected constraints.
4. **Output Report:** Generate the review document at the configured `work-ledger.yml` path. The architectural violations and findings MUST be provided in a deterministic YAML block directly within the Markdown file, formatted EXACTLY as follows:

```yaml
findings:
  - file: "path/to/ARCHITECTURE.md"
    line: 20
    severity: "High" # or Critical, Medium, Low
    comment: "Violation of CQRS boundaries. Required remediation details..."
```

Do not use Markdown tables for the findings. Update `EPIC.md` `design_reviews.architecture` status.
