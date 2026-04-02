# Assessment Template

Every advisor MUST produce output conforming EXACTLY to this structure. No deviations.

## Required Output Format

```markdown
## [Advisor Role Name] Assessment

### Candidate Rankings

#### 1. [Candidate Title]
- **Score**: [1-5, integer only]
- **Rationale**: [2-3 sentences. MUST reference specific evidence. No vague statements like "this seems useful."]
- **Evidence**: [Concrete references: file paths, roadmap line items, epic IDs, standard IDs, or coverage metrics]
- **Risks**: [1-2 sentences on what could go wrong if we build this next]
- **Enablement**: [1-2 sentences on what future work this unblocks]

#### 2. [Candidate Title]
- **Score**: [1-5]
- **Rationale**: [...]
- **Evidence**: [...]
- **Risks**: [...]
- **Enablement**: [...]

[Continue for ALL candidates]

### Top Pick
**Recommended**: [Candidate Title]
**One-line justification**: [Single sentence explaining why this candidate ranks highest from this advisor's perspective]
```

## Strict Rules

1. ALL candidates MUST be scored. Omitting a candidate is FORBIDDEN.
2. Scores MUST be integers 1-5 per `scoring-rubric.md`.
3. Rationale MUST cite specific evidence, not opinions.
4. Each advisor MUST rank candidates from highest to lowest score.
5. If two candidates tie within a single advisor, rank by the advisor's domain-specific tiebreaker (stated in the advisor's reference file).
6. The `Top Pick` section is MANDATORY.
