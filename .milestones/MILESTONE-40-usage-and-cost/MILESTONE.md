---
id: M40
title: Agent Usage and Cost
status: todo
goal: Agents report the tokens and money each piece of work cost, and people see it per task, per agent and per project - so the cost of autonomous work is visible where the work is.
depends_on: [M35]
surfaces: [contract, backend, cli, gui, specs]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M40 — Agent Usage and Cost

## 1. Goal

`ReportUsage` records input/output tokens, cost and model against a task (an
agent's own report, idempotent by key). Each task shows its totals; a usage
report breaks totals down by agent, project and day over a window. The CLI and
an MCP tool report usage; the GUI shows it on the task and on Reports.

## 2. Why Now

The landscape review's second unscheduled item: GitHub meters agent sessions
per premium request with their own billing SKUs. At a 20K-agent target,
"what did this cost" is a question a supervisor cannot answer today.

## 3. Exit Criteria

- [ ] `ReportUsage` validates non-negative bounded values, is idempotent by
  key, and needs `tasks:write`; the task's totals reflect it.
- [ ] `GetUsageReport` gives totals by agent, project and day for an org or
  project over 1-365 days, using one grouped query per breakdown.
- [ ] CLI `tasks usage report|show`, `reports usage`; MCP `report_usage`.
- [ ] GUI: usage on the task dialog; an "Agent spend" panel on Reports.
- [ ] CI green on `main`.

## 4. Scope

**Out of scope:** pricing tables (agents report cost themselves), budgets and
alerts on spend - candidates once the numbers exist.

## 5. Task Breakdown

- [ ] **M40-T01** — Contract and schema.
- [ ] **M40-T02** — ReportUsage, task totals, usage report.
- [ ] **M40-T03** — CLI and MCP.
- [ ] **M40-T04** — GUI.
- [ ] **M40-T05** — Docs and close.

## 6. Verification

As M39.

## 7. Risks

- **Cost precision.** Stored as integer micro-dollars, never floats.
