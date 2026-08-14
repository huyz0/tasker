---
name: milestone-prioritize
description: Runs an 8-advisor council in two parallel rounds to decide what the delivery plan should tackle next, and writes a scored COUNCIL report with what/why/how. Use when the next milestone is not obvious, or the plan may be missing work, and the choice needs evidence rather than intuition.
---

# Role

Strategic Planning Council — Thin Orchestrator.

# Goal

Produce a defensible recommendation for what the delivery plan tackles next,
scored independently across eight domain lenses, with the full audit trail of
how it won.

# Modes

| Mode | Use |
|---|---|
| `auto` | The only mode. The council is autonomous by construction — a moderator that asks the user is a moderator injecting bias. |

# Constraints

- Follow `@.agents/protocols/work-ledger.md` to resolve artifact paths.
- Follow `@.agents/protocols/context-budget.md`. The orchestrator routes; it does not think.
- MUST NOT generate candidates, score them, or inject context into itself. Every advisor loads its own context through its Self-Injection Protocol.
- MUST NOT pass opinions, summaries or pre-digested context between rounds — relay the advisors' output verbatim. An orchestrator that summarises is an orchestrator that biases.
- MUST NOT skip an advisor. All 8 produce an assessment in both rounds.
- MUST dispatch all 8 advisors of a round simultaneously. Sequential dispatch is a defect, not a style choice.
- DO NOT ask the user anything. This skill is autonomous only.
- DO NOT emit conversational filler.

# Instructions

1. **Pre-flight**: resolve the ledger; ensure `.milestones/council/` exists. Load
   nothing else — no product docs, no standards, no codebase survey.

2. **Round 1 — proposal.** Dispatch all 8 advisors in parallel on the
   fast/efficient model tier, using the Round 1 template in
   `references/dispatch.md`. Each proposes at least 2 candidates from its own
   domain and scores them. Collect all 8.

   | # | Advisor | Guidelines |
| --- | --- | --- |
   | 1 | Product Roadmap | `references/advisor-product-roadmap.md` |
   | 2 | User Value | `references/advisor-user-value.md` |
   | 3 | Dependency Order | `references/advisor-dependency.md` |
   | 4 | Technical Debt | `references/advisor-tech-debt.md` |
   | 5 | Implementation State | `references/advisor-implementation.md` |
   | 6 | Test Coverage | `references/advisor-test-coverage.md` |
   | 7 | Security | `references/advisor-security.md` |
   | 8 | Build & Deploy | `references/advisor-build-deploy.md` |

3. **Merge.** Dispatch one Moderator on the advanced-reasoning tier with all 8
   assessments (`references/moderator.md`, Phase A). It de-duplicates by title and
   scope and records how many advisors proposed each candidate — that count is the
   consensus signal, and it is evidence the weighted score cannot express. It also
   drops any candidate an open milestone already owns — recommending work the
   plan has already sequenced wastes the council.

4. **Round 2 — final scoring.** Dispatch all 8 advisors in parallel again with the
   merged list. Each scores **every** candidate through its own lens only.
   Omitting a candidate or straying outside the lens is forbidden.

5. **Synthesis.** Dispatch the Moderator (Phase B) with all 8 final assessments.
   It applies the weights and tie-breaks in `references/scoring-rubric.md` and
   produces the report body.

6. **Write the report** to `.milestones/council/` as
   `COUNCIL-<4-digit>-<YYYY-MM-DDTHH-MM-SS>.md`, numbering from
   `max(existing) + 1`, using `references/council-report.tmpl.md`. Report the
   recommendation and stop.

Total dispatches: 18 sub-agents across 4 sequential wall-clock steps.

# Output Format

```
COUNCIL 0004 — 11 candidates, 8 advisors × 2 rounds

  Recommend: Repository Webhooks & Event Ingestion   4.35 / 5.00
  Consensus: proposed independently by 6/8 advisors
  Runner-up: Read-path caching (3.90), Agent token rotation (3.72)
  Report:    .milestones/council/COUNCIL-0004-2026-08-15T09-12-03.md
  Next:      /milestone-plan  (add it as M13, or re-scope M08)
```
