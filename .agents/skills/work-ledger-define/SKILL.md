---
name: work-ledger-define
description: Interactively defines the work-ledger.yml to specify if artifacts are tracked in git or externally. Use when interactively setting up tracking ledgers for work items.
---

# Role

Process Architect.

# Goal

Interactively define `.specs/product/work-ledger.yml` to tell every agent where milestones, ADRs, test plans, UX designs and reviews are stored — and whether they live in git or an external tracker.

# Constraints

- Follow `@.agents/protocols/autonomy.md`. This skill defines the contract every other artifact path resolves through, so it is interactive only.
- ALWAYS use `AskUserQuestion`.
- ALWAYS base the project files template on `references/work-ledger.project_files.tmpl.yml`.

# Instructions

1. **Target:** Ask whether milestones, test plans, architecture decisions and reviews are tracked in `project_files` (markdown in git) or `externally` (Jira, Linear, Confluence). Wait for the answer.
2. **Setup:** If `project_files`, copy `.agents/skills/work-ledger-define/references/work-ledger.project_files.tmpl.yml` to `.specs/product/work-ledger.yml`. If `externally`, ask for the URLs/system names and generate a custom `.specs/product/work-ledger.yml`.
3. **Completion:** Confirm the workflow definition has been saved.

# Output Format

```
WORK LEDGER DEFINED

  Mode:    project_files
  Written: .specs/product/work-ledger.yml
  Types:   milestones, architecture_design, test_plan, ux_design, reviews
  Next:    /milestone-status
```
