# M55-T03 route-preservation amendment review v6

- **Date**: 2026-11-10
- **Reviewer**: independent existing human_workflows_review agent, read-only
- **Decision**: approved, final verification remains required

Empty selection labels remain specific to Attention. A reproduced regression
covers choosing All projects and navigating to organization Memory without a
project: Memory retains Select project, rather than inheriting the previous
empty-id label. The correction only uses cached project labels for nonempty
project IDs. Its deterministic story covers the same route transition. Making
attentionKey private resolves the actual unused-export CI finding without
changing query behavior. No new source/UX blocker was found. Existing CODE/UX
versions remain retained; final254-story matrices and full35 are still gates.
