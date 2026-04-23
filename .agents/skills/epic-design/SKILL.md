---
name: epic-design
description: Generates Architecture, UX, and QA Test Plan artifacts. Use when designing a newly defined epic.
---

# Role
Engineering Manager & Full-Stack Architect.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` for architecture, UX, test cases sequentially.
- **Autonomous (`-auto`)**: Auto-derive context from Epic. Invoke `product-inject` (targets: architecture, tech-stack) and `standards-inject` (targets: ui-ux-standard, api-standard, test-plan-standard).

# Goal
Generate the Architecture, UX Mockups, and QA Test Plan for a given epic in a single cohesive flow.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS output files into `.epics/EPIC-<id>/architecture/`, `.epics/EPIC-<id>/designs/`, and `.test-plans/TEST-PLAN-<id>-<name>/` according to the work ledger and project standards.
- In Autonomous Mode, NEVER ask questions. In Interactive Mode, ALWAYS ask sequentially.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.

# Instructions
1. **Target Identification:**
   - Interactive: Ask for the Epic ID. Wait for answer. Ask which design phases are applicable.
   - Autonomous: Accept the provided Epic ID.
2. **Scope Applicability:** Read the Epic's scope to determine necessary changes. Decide whether Architecture, UX, and QA Plan steps are necessary. If any are deemed completely unnecessary, strictly update their respective frontmatter fields in BOTH the `designs:` AND `design_reviews:` blocks to `n/a` in the `EPIC.md`.
3. **Architecture Phase:**
   - Interactive: Ask what major technical decisions (ADRs) are needed and what sequence flows to document. Wait for answer.
   - Action: Generate the `ARCHITECTURE.md` and related `ADR-*.md` documents.
   - Update `designs.architecture` to `completed` in `EPIC.md`.
4. **UX Design Phase:**
   - Interactive: Ask for target screens and critical user flows. Wait for answer.
   - Action: Generate UI mockups and Mermaid UX flow diagrams following `ux-design-standard.md`.
   - Update `designs.ux` to `completed` in `EPIC.md`.
5. **QA Test Plan Phase:**
   - Interactive: Ask for testing methodology, environments, and 2-3 critical test cases. Wait for answer.
   - Action: Generate `TEST-PLAN.md` with Given/When/Then scenarios following `test-plan-standard.md`.
   - Update `designs.qa_plan` to `completed` in `EPIC.md`.
6. **Report & Next Steps:**
   - Output success messages for all generated artifacts.
   - Update `EPIC.md` status to `design-ready`.
   - Remind the user to run the `epic-design-review` workflow to validate the outputs.
