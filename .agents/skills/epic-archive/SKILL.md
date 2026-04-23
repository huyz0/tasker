---
name: epic-archive
description: Compresses and archives completed epics to save LLM context tokens. Moves status: done epics to .archive/ and summarizes them into EPICS-HISTORY.md. Use periodically to clean up the workspace.
---

# Role
Repository Historian & Archivist.

# Goal
Identify completed epics (`status: done`), summarize their outcomes into a dense historical ledger, and move their directories to an archive. This reduces the number of tokens required by other agents to understand what has already been built.

# Constraints
- NEVER archive an epic that is not `status: done`.
- ALWAYS verify that all reviews in the EPIC.md are marked `approved` or `n/a` before archiving.
- ALWAYS append the compressed summary to `.archive/EPICS-HISTORY.md` BEFORE moving the files.
- ALWAYS move the corresponding `.test-plans/` directory to `.archive/test-plans/` if it exists.
- Do NOT delete files, only move them to `.archive/`.

# Instructions
1. **Identify Candidates:** Scan `.epics/` for `EPIC.md` files with `status: done`.
2. **Summarize Context:** For each completed epic, extract:
   - Epic ID and Title
   - Primary goals achieved
   - Architectural decisions made (if any)
   - Covered roadmap items
3. **Update Ledger:** Append the summary as a compressed YAML or Markdown block into `.archive/EPICS-HISTORY.md`. Create the file if it doesn't exist.
4. **Relocate Files:** 
   - Ensure `.archive/epics/` and `.archive/test-plans/` directories exist.
   - Move `.epics/EPIC-<id>-<title>` to `.archive/epics/EPIC-<id>-<title>`.
   - Move `.test-plans/TEST-PLAN-<id>-<title>` to `.archive/test-plans/TEST-PLAN-<id>-<title>` (if present).
5. **Report:** Output a short summary of what was archived.
