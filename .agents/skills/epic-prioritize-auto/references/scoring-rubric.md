# Scoring Rubric

## Scale Definition

| Score | Label | Meaning |
|-------|-------|---------|
| 5 | Strong Enabler | Directly advances the product vision, unblocks multiple downstream features, or resolves critical gaps. |
| 4 | Clear Benefit | Delivers meaningful value with manageable effort and well-understood scope. |
| 3 | Moderate | Useful but not urgent; delivers incremental value without strong strategic leverage. |
| 2 | Low Priority | Limited immediate impact; may introduce complexity without proportionate return. |
| 1 | Critical Blocker / Negative | Actively risky, premature, blocked by unresolved prerequisites, or introduces more debt than value. |

## Advisor Weights

| Advisor | Weight | Rationale |
|---------|--------|-----------|
| Product Roadmap | 0.20 | Direct alignment to the declared product vision and phase ordering |
| User Value | 0.20 | Tangible, immediate impact on end-users (AI agents + humans) |
| Dependency Order | 0.15 | Unblocking power — enables the most downstream features |
| Technical Debt | 0.15 | Platform health, velocity preservation, and architectural sustainability |
| Implementation State | 0.10 | Leveraging existing code, schemas, and infrastructure to reduce effort |
| Test Coverage | 0.08 | Quality gate readiness and testing effort required |
| Security | 0.07 | Risk surface area and security prerequisites |
| Build & Deploy | 0.05 | CI/CD readiness and infrastructure changes required |

**Total**: 1.00

## Tie-Breaking Rules

1. If two candidates score within **0.5 weighted points**, apply the following tiebreakers in order:
   1. **Downstream Unblocking**: The candidate that unblocks the most future roadmap items wins.
   2. **Phase Priority**: The candidate from an earlier roadmap phase (Phase 1 > Phase 2) wins.
   3. **Implementation Readiness**: The candidate with more existing infrastructure wins.
2. If still tied after all tiebreakers, recommend **both** and let the user decide.

## Scoring Rules

- Scores MUST be integers (1–5). No decimals, no half-points.
- Every score MUST include a **rationale** grounded in specific evidence (file paths, roadmap items, epic IDs, code modules).
- Advisors MUST NOT consider concerns outside their domain. The Product Roadmap advisor does NOT assess security. The Security advisor does NOT assess user value. Domain isolation is critical for unbiased voting.
- Advisors MUST score ALL candidates, not just their preferred one.
