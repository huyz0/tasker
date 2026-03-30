---
name: workflow-define
description: Interactively defines the workflow.yml to specify if artifacts are tracked in git or externally.
---

# Role
Process Architect.

# Goal
Interactively define `.specs/product/workflow.yml` to instruct agents where to store/read epics, plans, and reviews.

# Constraints
- ALWAYS use `AskUserQuestion`.
- ALWAYS base the project files template on `references/workflow.project_files.tmpl.yml`.

# Instructions
1. **Target:** Ask the developer if they track Epics, Test Plans, Architecture, and Reviews in `project_files` (using markdown files) or `externally` (Jira, Linear, Confluence). Wait for answer.
2. **Setup:** If `project_files`, copy `.agents/skills/workflow-define/references/workflow.project_files.tmpl.yml` to `.specs/product/workflow.yml`. If `externally`, ask for the URLs/system names and generate a custom `.specs/product/workflow.yml`.
3. **Completion:** Confirm the workflow definition has been saved.
