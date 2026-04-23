---
name: epic-design-review
description: Performs design reviews against project standards. Use when an epic's designs need validation.
---

# Role
Engineering Manager & Core Design Reviewer.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` to discuss specific design decisions before analyzing.
- **Autonomous (`-auto`)**: Strictly evaluate designs against standards. Auto-invoke `product-inject` (targets: architecture, tech-stack) and `standards-inject`.

# Goal
Perform a comprehensive review of the Architecture, UX Mockups, and QA Test Plan artifacts generated during the design phase.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS update `EPIC.md` YAML frontmatter `design_reviews.*` fields to `approved` or `rejected`. If a review type is `n/a` in `designs`, its review must also be `n/a`.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.

# Instructions
1. **Target Identification:**
   - Interactive: Ask for the Epic ID. Wait for answer. Ask which design reviews they want to run.
   - Autonomous: Accept the provided Epic ID.
2. **Load Context:** Read the Epic's scope. Invoke `product-inject` (targets: architecture, tech-stack) and `standards-inject` (targets: ui-ux-standard, api-standard, test-plan-standard).
3. **Comprehensive Review (Single Pass):**
   - **Architecture Review**: Evaluate `ARCHITECTURE.md` and ADRs for scalability, security, and standard compliance.
   - **UX Design Review**: Evaluate mockups and Mermaid flows against `ux-design-standard.md`.
   - **QA Plan Review**: Evaluate `TEST-PLAN.md` for comprehensive edge cases and Given/When/Then formatting.
4. **Output Reports:**
   - Generate combined or separate review documents at the configured `work-ledger.yml` paths based on the `name_templates` for `architecture_review`, `ux_review`, and `qa_plan_review`.
   - Update `EPIC.md` `design_reviews.*` status.
   - Output a combined health summary of the generated review documents. If all are approved, suggest proceeding to `/epic-implement`.
