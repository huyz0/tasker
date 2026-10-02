---
id: ADR-0033
status: accepted
date: 2026-10-02
milestone: M40
---

# Agents report what work cost, as integer micro-dollars against a task

## Context

An organization running many agents cannot answer "what did this piece of work
cost, and who spent it" from Tasker. The cost lives in each model provider's
bill, by API key and day, detached from the work. GitHub meters agent sessions
per request (2026-10-02 landscape review); a tracker where agents are workers
should show spend where the work is.

## Options

**Who measures.**

- **(a) The agent reports.** It knows the model, the tokens and its own price;
  Tasker records what it is told.
- **(b) Tasker computes cost from tokens and a price table.** Prices change,
  differ by contract and cache tier, and would need maintaining for every
  provider. A wrong table makes every number wrong, quietly.
- **(c) Tasker proxies model calls.** Exact, but turns a tracker into an LLM
  gateway, which is a different product.

**Where it attaches.** To a task (the unit of work people look at), with the
agent and project denormalized for reporting; or to an agent session, which
Tasker does not model.

**How money is stored.** A float sum drifts; a decimal type differs by
dialect. Integer micro-dollars (1 USD = 1,000,000) are exact, sum with plain
`SUM`, and fit 64-bit integers for any realistic total.

## Decision

**(a)**, attached to a task, in integer micro-dollars.

- `usage_records`: task, org, project, the reporting agent (or user), model
  name, input and output tokens, `cost_micros`, an optional idempotency key,
  time. Append-only; there is no edit or delete RPC.
- `ReportUsage` (`tasks:write`, `task:write` for a person). Each value is a
  non-negative integer up to a per-report bound (10^9 tokens, 10^9 micros =
  USD 1,000), and a report must carry something. A key replayed on the same
  task returns the original record with `replayed = true` - retries after a
  timeout must not double-count spend.
- Totals: `GetTask` carries `usage` (one aggregate query, not in lists);
  `ListUsageRecords` pages a task's reports with its totals.
- `GetUsageReport` (people, `dashboard:read`): totals and breakdowns by agent,
  project and UTC day over 1-365 days for an org or one project - one grouped
  query per breakdown, whatever the volume. Agents are refused, as for the
  other Reports RPCs: an on-the-loop surface is a person's.

## Consequences

- Numbers are only as honest as the agents reporting them. The record says who
  reported, so a misreporting agent is attributable.
- No budgets or alerts yet; they need these numbers first.
- Usage of a purged task goes with it (cascade), so historical spend reports
  shrink when tasks are purged. Soft-deleted tasks still count.
