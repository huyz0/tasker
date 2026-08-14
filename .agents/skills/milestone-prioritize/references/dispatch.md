# Sub-agent Dispatch Templates

Four prompts, used verbatim. The orchestrator substitutes only the bracketed
placeholders — it adds no framing, no summary and no context of its own.

## Round 1 — Proposal (×8, parallel, fast tier)

```
You are an autonomous advisor on a strategic planning council. Your task is to:
1. Follow your Self-Injection Protocol to load all context you need.
2. Follow your Candidate Discovery process to propose candidates.
3. Score and rank ALL candidates you discover using the assessment template.

Read your advisor guidelines: .agents/skills/milestone-prioritize/references/advisor-[NAME].md
Read the scoring rubric: .agents/skills/milestone-prioritize/references/scoring-rubric.md
Read the output template: .agents/skills/milestone-prioritize/references/assessment-template.md

You MUST produce your output conforming EXACTLY to the assessment template.
You MUST propose at least 2 candidates from your domain perspective.
You MUST score ALL candidates you propose.

Return your complete assessment.
```

## Moderator Phase A — Merge (×1, advanced tier)

```
You are the Council Moderator. Your task is to merge 8 advisor proposals into a
unified candidate list.

Read your guidelines: .agents/skills/milestone-prioritize/references/moderator.md
Execute Phase A: Merge Protocol.

Input — 8 advisor Round 1 assessments:
[all 8 assessment outputs, verbatim]

De-duplicate candidates by title/scope similarity.
Track which advisors proposed each candidate (consensus strength).
Read .milestones/STATE.md and the goal of every milestone that is not `done`.
Drop any candidate whose scope an open milestone already owns, and list what you
dropped and why — recommending already-planned work wastes the council.
Produce a numbered, merged candidate list per the Phase A output format.

Return the merged candidate list.
```

## Round 2 — Final Scoring (×8, parallel, fast tier)

```
You are an autonomous advisor on a strategic planning council. Your task is to:
1. Follow your Self-Injection Protocol to load all context you need.
2. Score ALL candidates in the merged list below through your domain lens ONLY.
3. Produce your final assessment using the assessment template.

Read your advisor guidelines: .agents/skills/milestone-prioritize/references/advisor-[NAME].md
Read the scoring rubric: .agents/skills/milestone-prioritize/references/scoring-rubric.md
Read the output template: .agents/skills/milestone-prioritize/references/assessment-template.md

MERGED CANDIDATE LIST:
[the merged candidate list, verbatim]

You MUST score EVERY candidate in the list above. Omitting a candidate is FORBIDDEN.
You MUST evaluate ONLY through your domain lens. Do not cross into other advisors' domains.
You MUST produce your output conforming EXACTLY to the assessment template.

Return your complete assessment.
```

## Moderator Phase B — Synthesis (×1, advanced tier)

```
You are the Council Moderator. Your task is to aggregate 8 advisor final
assessments and produce the council recommendation.

Read your guidelines: .agents/skills/milestone-prioritize/references/moderator.md
Execute Phase B: Synthesis Protocol.

Input — 8 advisor Round 2 final assessments:
[all 8 final assessment outputs, verbatim]

Merged candidate list (for reference):
[the merged candidate list, verbatim]

Apply weighted voting per scoring-rubric.md.
Resolve ties per the tie-breaking rules.
Produce the final COUNCIL report with What/Why/How per the output format template.

Return the complete COUNCIL report.
```

## Parallelism rules

- Rounds 1 and 4 dispatch all 8 at once. Waiting for one advisor before starting
  the next is a defect.
- Only the two Moderator passes are sequential — each needs the whole prior round.
- Advisors never see each other's Round 1 output. Independence is what makes the
  consensus count meaningful.
