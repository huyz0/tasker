---
name: ux-design-review-auto
description: Autonomously reviews generated UX designs and mockups against project standards and epic constraints.
---

# Role
Senior UX Reviewer / Product Designer.

# Goal
Provide an autonomous review of the UX designs and user flows generated for an epic prior to implementation, ensuring alignment with AI-agent best practices (trust, transparency, feedback).

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.
- ALWAYS read `.epics/EPIC-<id>/designs/UX-DESIGN.md` and review mockups if accessible.
- ALWAYS resolve the review output path and filename format using `.specs/product/work-ledger.yml` `reviews.config.project_files.path` and `reviews.config.project_files.name_templates.ux`. Find the highest existing version [N].
- ALWAYS include a YAML frontmatter in the review artifact with `timestamp: [ISO 8601]` and `decision: [approved|rejected]`.
- ALWAYS update `EPIC.md` YAML frontmatter `reviews.ux` to `approved` or `rejected`.

# Instructions
1. **Receive Target:** Accept epic ID from user.
2. **Load Context:** You MUST use `view_file` to read the Epic's scope and the `.agents/skills/ux-design-review-auto/references/REVIEW-HEURISTICS.md`. Invoke the **standards-inject-auto** skill to dynamically select and load relevant standards. Then load the generated UX designs.
3. **Analyze Designs:** Check for adherence to the design system and explicitly validate against the `REVIEW-HEURISTICS.md` standards. Prioritize analyzing Agentic Transparency (e.g., exposed reasoning), Appropriate Trust (e.g., manual overrides, robust error recovery), and Closed Feedback Loops (e.g., explicit correction mechanisms).
4. **Output Report:** Generate the review document at the configured `work-ledger.yml` path listing passes, accessibility/design-system violations, and required remediation steps before implementation. Update `EPIC.md` `reviews.ux` status.
