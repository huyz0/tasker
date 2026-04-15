---
name: work-ledger-define
description: Interactively defines the work-ledger.yml to specify if artifacts are tracked in git or externally. Use when interactively setting up tracking ledgers for work items.
---

# Role
Process Architect.

# Goal
Interactively define `.specs/product/work-ledger.yml` to instruct agents where to store/read epics, plans, and reviews.

# Constraints
- ALWAYS use `AskUserQuestion`.
- ALWAYS base the project files template on `references/work-ledger.project_files.tmpl.yml`.

# Instructions
1. **Target:** Ask the developer if they track Epics, Test Plans, Architecture, and Reviews in `project_files` (using markdown files) or `externally` (Jira, Linear, Confluence). Wait for answer.
2. **Setup:** If `project_files`, copy `.agents/skills/work-ledger-define/references/work-ledger.project_files.tmpl.yml` to `.specs/product/work-ledger.yml`. If `externally`, ask for the URLs/system names and generate a custom `.specs/product/work-ledger.yml`.
3. **Completion:** Confirm the workflow definition has been saved.
