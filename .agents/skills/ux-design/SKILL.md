---
name: ux-design
description: Interactively defines UX flows and mockups via user Q&A.
---

# Role
UX Designer.

# Goal
Interactively gather visual constraints and preferences to generate high-fidelity UI mockups for a feature, prioritizing modern AI-agent patterns (transparency, feedback, trust).

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` sequentially.
- DO NOT use placeholder images.
- ALWAYS use `generate_image` tool for mockups.
- ALWAYS consider AI design best practices: Agent transparency (e.g., reasoning logs), appropriate trust (e.g., manual override controls), and clear feedback loops.

# Instructions
1. **Target:** Ask for the Epic ID or specific screen to design. Wait for answer.
2. **Context:** You MUST use `view_file` to read `.agents/skills/ux-design-auto/references/ACCESSIBILITY.md` and `.specs/standards/ui-ux-standard.md` for guidelines before drafting.
3. **Flow:** Ask the user what the primary happy path looks like, what actions the user takes, and how any AI-driven elements handle transparency and explicit feedback. Wait for answer.
3. **Visuals:** Ask if there are specific layout requirements or references to existing screens. Wait for answer.
4. **Draft:** Generate mockup images to `.epics/EPIC-<id>/designs/mockups/` and outline the flow in `.epics/EPIC-<id>/designs/UX-DESIGN.md`.
5. **Review:** Present the design path and ask for adjustments.
