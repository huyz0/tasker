---
name: epic-prioritize-auto
description: Autonomously evaluates uncovered roadmap items using an 8-advisor council model, scoring candidates across product roadmap, implementation state, technical debt, dependency order, user value, test coverage, security, and build readiness. Produces a deterministic COUNCIL report with what/why/how for epic-define-auto. Use when deciding what epic to build next.
---

# Role
Strategic Planning Council — Thin Orchestrator.

# Goal
Dispatch autonomous sub-agent advisors to independently discover, propose, and score epic candidates. The orchestrator performs NO context injection, NO candidate generation, and NO scoring. It only checks preconditions, dispatches sub-agents, relays outputs between rounds, and writes the final report.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths.
- DO NOT ask the user any questions. Run completely autonomously.
- DO NOT output conversational filler ("I'll guide", "Great!", "Let's do this").
- DO NOT skip any advisor. All 8 MUST produce assessments in each round.
- DO NOT introduce the orchestrator's own bias. The orchestrator passes data between sub-agents — NEVER opinions, summaries, or pre-digested context.
- DO NOT inject context (product foundations, standards, codebase survey) into the orchestrator itself. Each sub-agent loads its own context via its Self-Injection Protocol.
- ALWAYS use the assessment template from `references/assessment-template.md` for advisor outputs.
- ALWAYS use the scoring scale and weights from `references/scoring-rubric.md`.
- ALWAYS maximize parallelism — dispatch all 8 advisors simultaneously in each round.

# Instructions

## Phase 1: Precondition Check

1. **Work ledger**: Read `.specs/product/work-ledger.yml`. If missing, exit with the error message above.
2. **Council directory**: Ensure `.epics/council/` exists. Create it if not.
3. **Ready**: Proceed directly to Round 1. Do NOT load product foundations, standards, or scan the codebase — the sub-agents handle all context injection themselves.

## Phase 2: Round 1 — Parallel Proposal (All 8 Advisors)

4. **Dispatch all 8 advisor sub-agents IN PARALLEL.** Each sub-agent runs independently with its own fresh context window. The orchestrator provides ONLY the following in each sub-agent's prompt:

   **Sub-agent prompt template (Round 1):**
   ```
   You are an autonomous advisor on a strategic planning council. Your task is to:
   1. Follow your Self-Injection Protocol to load all context you need.
   2. Follow your Candidate Discovery process to propose epic candidates.
   3. Score and rank ALL candidates you discover using the assessment template.

   Read your advisor guidelines: .agents/skills/epic-prioritize-auto/references/advisor-[NAME].md
   Read the scoring rubric: .agents/skills/epic-prioritize-auto/references/scoring-rubric.md
   Read the output template: .agents/skills/epic-prioritize-auto/references/assessment-template.md

   You MUST produce your output conforming EXACTLY to the assessment template.
   You MUST propose at least 2 candidates from your domain perspective.
   You MUST score ALL candidates you propose.

   Return your complete assessment.
   ```

   **Advisor sub-agents dispatched in parallel:**
   1. Product Roadmap Advisor (`references/advisor-product-roadmap.md`)
   2. User Value Advisor (`references/advisor-user-value.md`)
   3. Dependency Order Advisor (`references/advisor-dependency.md`)
   4. Technical Debt Advisor (`references/advisor-tech-debt.md`)
   5. Implementation State Advisor (`references/advisor-implementation.md`)
   6. Test Coverage Advisor (`references/advisor-test-coverage.md`)
   7. Security Advisor (`references/advisor-security.md`)
   8. Build & Deploy Advisor (`references/advisor-build-deploy.md`)

5. **Collect all 8 outputs.** Wait for all parallel sub-agents to complete. Store each assessment.

## Phase 3: Round 1.5 — Moderator Merge

6. **Dispatch a Moderator sub-agent** with all 8 Round 1 assessments as input:

   **Moderator prompt (Phase A — Merge):**
   ```
   You are the Council Moderator. Your task is to merge 8 advisor proposals into a unified candidate list.

   Read your guidelines: .agents/skills/epic-prioritize-auto/references/moderator.md
   Execute Phase A: Merge Protocol.

   Input — 8 advisor Round 1 assessments:
   [Paste all 8 assessment outputs here]

   De-duplicate candidates by title/scope similarity.
   Track which advisors proposed each candidate (consensus strength).
   Produce a numbered, merged candidate list per the Phase A output format.

   Return the merged candidate list.
   ```

7. **Store the merged candidate list** returned by the Moderator.

## Phase 4: Round 2 — Parallel Final Scoring (All 8 Advisors)

8. **Dispatch all 8 advisor sub-agents IN PARALLEL again.** This time, each sub-agent receives the merged candidate list and MUST score ALL candidates on it (not just the ones it originally proposed).

   **Sub-agent prompt template (Round 2):**
   ```
   You are an autonomous advisor on a strategic planning council. Your task is to:
   1. Follow your Self-Injection Protocol to load all context you need.
   2. Score ALL candidates in the merged list below through your domain lens ONLY.
   3. Produce your final assessment using the assessment template.

   Read your advisor guidelines: .agents/skills/epic-prioritize-auto/references/advisor-[NAME].md
   Read the scoring rubric: .agents/skills/epic-prioritize-auto/references/scoring-rubric.md
   Read the output template: .agents/skills/epic-prioritize-auto/references/assessment-template.md

   MERGED CANDIDATE LIST:
   [Paste the merged candidate list from Phase 3 here]

   You MUST score EVERY candidate in the list above. Omitting a candidate is FORBIDDEN.
   You MUST evaluate ONLY through your domain lens. Do not cross into other advisors' domains.
   You MUST produce your output conforming EXACTLY to the assessment template.

   Return your complete assessment.
   ```

9. **Collect all 8 final outputs.** Wait for all parallel sub-agents to complete. Store each final assessment.

## Phase 5: Final Synthesis — Moderator

10. **Dispatch a Moderator sub-agent** with all 8 Round 2 final assessments:

    **Moderator prompt (Phase B — Synthesis):**
    ```
    You are the Council Moderator. Your task is to aggregate 8 advisor final assessments and produce the council recommendation.

    Read your guidelines: .agents/skills/epic-prioritize-auto/references/moderator.md
    Execute Phase B: Synthesis Protocol.

    Input — 8 advisor Round 2 final assessments:
    [Paste all 8 final assessment outputs here]

    Merged candidate list (for reference):
    [Paste the merged candidate list here]

    Apply weighted voting per scoring-rubric.md.
    Resolve ties per the tie-breaking rules.
    Produce the final COUNCIL report with What/Why/How per the output format template.

    Return the complete COUNCIL report.
    ```

11. **Store the Moderator's final output** — this is the COUNCIL report content.

## Phase 6: Output Generation

12. **Generate Council Report:**
    - Determine the next council report number by scanning `.epics/council/` for existing `COUNCIL-*.md` files. Next number = `max(existing) + 1` or `0001` if directory is empty.
    - Generate timestamp in format `YYYY-MM-DDTHH-MM-SS`.
    - Write the file to `.epics/council/COUNCIL-<4-digit-number>-<timestamp>.md`.
    - Example: `.epics/council/COUNCIL-0001-2026-04-03T08-22-41.md`.
    - Use the Moderator's Phase B output as the report body, wrapped in the council report template below.

13. **Confirmation:**
    - Display the recommendation summary.
    - Instruct: "Review this recommendation, then run `/epic-define-auto` with the recommended topic."

# Critical Rules for Parallelism

- **Round 1 (Phase 2)**: ALL 8 advisors MUST be dispatched simultaneously. Do NOT wait for one advisor before starting another.
- **Round 2 (Phase 4)**: ALL 8 advisors MUST be dispatched simultaneously. Do NOT wait for one advisor before starting another.
- **Sequential gates**: Only Phases 3 and 5 (Moderator) are sequential — they depend on collecting all parallel outputs from the prior round.
- **Total sub-agent dispatches**: 18 (8 Round 1 + 1 Moderator Merge + 8 Round 2 + 1 Moderator Synthesis).
- **Wall-clock steps**: 4 sequential steps (Round 1 parallel → Merge → Round 2 parallel → Synthesis).

# Output Format

## Council Report Template
```markdown
---
generated_at: [YYYY-MM-DD]
council_version: 2
candidates_evaluated: [N]
advisors: 8
rounds: 2
---

# Next Epic Recommendation

## What
[1-2 sentence description of the recommended epic topic. Must be specific enough to feed directly into epic-define-auto.]

## Why
[3-5 sentences synthesizing the council's reasoning. MUST cite evidence from at least 3 advisor perspectives. MUST reference specific roadmap items, epic IDs, or architecture components.]

### Consensus Signal
- Candidate was proposed by [N/8] advisors in Round 1
- Highest consensus candidates: [list]

### Weighted Score Breakdown

| Advisor | Score (1-5) | Weight | Weighted |
|---------|-------------|--------|----------|
| Product Roadmap | X | 0.20 | X.XX |
| User Value | X | 0.20 | X.XX |
| Dependency Order | X | 0.15 | X.XX |
| Technical Debt | X | 0.15 | X.XX |
| Implementation State | X | 0.10 | X.XX |
| Test Coverage | X | 0.08 | X.XX |
| Security | X | 0.07 | X.XX |
| Build & Deploy | X | 0.05 | X.XX |
| **Total** | | **1.00** | **X.XX** |

## How
[3-5 sentences outlining the recommended technical approach. MUST reference architecture patterns (DDD bounded contexts, CQRS, etc.) and existing infrastructure from completed epics.]

## Runner-Up Candidates

### 2. [Title] — Score: X.XX
[1-sentence rationale for why it ranked second]

### 3. [Title] — Score: X.XX
[1-sentence rationale]

[Continue for all candidates]

## Advisor Assessments (Audit Trail)

<details>
<summary>Round 1: Proposal Phase</summary>

<details>
<summary>Product Roadmap Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>User Value Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Dependency Order Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Technical Debt Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Implementation State Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Test Coverage Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Security Advisor</summary>

[Full Round 1 assessment]

</details>

<details>
<summary>Build & Deploy Advisor</summary>

[Full Round 1 assessment]

</details>

</details>

<details>
<summary>Moderator Merge</summary>

[Full merged candidate list]

</details>

<details>
<summary>Round 2: Final Scoring</summary>

<details>
<summary>Product Roadmap Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>User Value Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Dependency Order Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Technical Debt Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Implementation State Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Test Coverage Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Security Advisor</summary>

[Full Round 2 assessment]

</details>

<details>
<summary>Build & Deploy Advisor</summary>

[Full Round 2 assessment]

</details>

</details>
```

## Success Context
```
✓ Epic prioritization council completed (2-round parallel model).
  Candidates evaluated: [N]
  Advisors dispatched: 8 × 2 rounds + 2 moderator passes = 18 sub-agents
  Parallelism: 4 sequential wall-clock steps
  Recommendation: [Title] (score: X.XX / 5.00)
  Consensus: Proposed by [N/8] advisors independently
  Output: .epics/council/COUNCIL-[XXXX]-[timestamp].md
  Next step: Review, then run /epic-define-auto with the recommended topic.
```
