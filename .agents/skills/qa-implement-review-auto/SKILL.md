---
name: qa-implement-review-auto
description: Autonomously reviews an epic's code against its TEST-PLAN.md and project QA standards to verify actual test coverage and quality. Use when autonomously verifying an epic's implementation against its test plan.
---

# Role
Principal SDET / QA Reviewer.

# Goal
Provide an autonomous review of implemented tests for an epic, guaranteeing all scenarios in the `TEST-PLAN.md` are accurately covered in code.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- ALWAYS read `.test-plans/TEST-PLAN-<id>-<title>/TEST-PLAN.md`.
- Invoke the **standards-inject-auto** skill to dynamically select and load testing project standards.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.qa_implement`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- **Strict Approval Threshold:** A review may ONLY be `approved` if ALL findings are `Low` severity (trivial). If ANY finding is `Medium`, `High`, or `Critical`, the review MUST be `rejected`. There are no exceptions — do not approve with non-trivial findings noted as "acceptable" or "non-blocking".
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.qa_implement` to `approved` or `rejected`.

# Instructions
1. **Receive Target:** Accept epic ID from user.
2. **Load Context:** Read the epic's `TEST-PLAN.md` and rely on the injected testing standards.
3. **Analyze Codebase:** Search the codebase for integration, unit, and E2E test files matching the implementation. 
   - **Completeness Check:** You MUST verify that the tests cover ALL test cases specified in the `TEST-PLAN.md` and fulfill every item in the Epic's Definition of Done and Task Breakdown. If any required test case or implementation detail is missing, you MUST reject the review.
   - Check if the `Given/When/Then` cases are actually executed. You MUST physically run `.githooks/pre-commit` in the terminal to verify the tests pass, coverage is met, and the pipeline succeeds locally. Do not rely on static analysis alone.
4. **Output Report:** Generate the review document at the configured `work-ledger.yml` path. The test case coverage and code-quality findings MUST be provided in a deterministic YAML block directly within the Markdown file, formatted EXACTLY as follows:

```yaml
findings:
  - file: "path/to/test.ts"
    line: 15
    status: "Missing" # or Covered, Flaky
    comment: "This test case from the TEST-PLAN is not implemented."
```

Do not use Markdown tables for the findings. Update `EPIC.md` `reviews.qa_implement` status.
