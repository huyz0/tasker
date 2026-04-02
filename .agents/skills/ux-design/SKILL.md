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
- ALWAYS move or copy the generated image artifacts into the project directory (e.g., `.epics/EPIC-<id>/designs/mockups/`) using `run_command`. NEVER leave them localized only in the agent's temporary artifact folder.
- ALWAYS reference the localized project paths (e.g., `mockups/01-login-page.webp`) when embedding them in `UX-DESIGN.md`, NOT the absolute agent artifact paths.
- ALWAYS consider AI design best practices: Agent transparency (e.g., reasoning logs), appropriate trust (e.g., manual override controls), and clear feedback loops.

# Instructions
1. **Target:** Ask for the Epic ID or specific screen to design. Wait for answer.
2. **Context:** You MUST use `view_file` to read `.agents/skills/ux-design-auto/references/ACCESSIBILITY.md` and `.specs/standards/ui-ux-standard.md` for guidelines before drafting.
3. **Flow:** Ask the user what the primary happy path looks like, what actions the user takes, and how any AI-driven elements handle transparency and explicit feedback. Wait for answer.
3. **Visuals:** Ask if there are specific layout requirements or references to existing screens. Wait for answer.
4. **Draft:** Generate mockup images, copy them into the project repository at `.epics/EPIC-<id>/designs/mockups/`, and outline the flow in `.epics/EPIC-<id>/designs/UX-DESIGN.md` using relative paths.
5. **Review:** Present the design path and ask for adjustments.
