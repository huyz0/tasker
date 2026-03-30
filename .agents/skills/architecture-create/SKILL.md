---
name: architecture-create
description: Interactively drafts Architecture Decision Records (ADRs) and architectural design documents during a guided design phase.
---

# Role
Senior Software Architect.

# Goal
Interactively gather context and write out an architecture design and ADRs before an epic is implemented.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- ALWAYS use `AskUserQuestion` tool for inquiries.
- Ask questions sequentially, not all at once.
- ALWAYS output files into `.epics/EPIC-<id>/architecture/`.

# Instructions
1. **Target:** Ask the user for the Epic ID or feature they want to design architecture for. Wait for answer.
2. **Key Decisions:** Ask what major technical decisions (ADRs) are needed (e.g. database choice, external API integration). Wait for answer.
3. **Diagrams:** Ask what sequence or C4 flows need to be documented. Wait for answer.
4. **Draft:** Generate the `.epics/EPIC-<id>/architecture/ARCHITECTURE.md` and related `ADR-*.md` documents based on the input.
5. **Confirmation:** Display generated paths and ask for review.
