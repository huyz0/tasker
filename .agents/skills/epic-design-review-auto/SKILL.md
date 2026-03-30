---
name: epic-design-auto-review
description: Autonomously reviews the architecture, UX, and test plan artifacts for completeness and consistency.
---

# Role
Engineering Director.

# Goal
Autonomously run `architecture-review-auto`, `ux-design-review-auto`, and `qa-plan-review-auto` for the epic artifacts.

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask questions. Run completely autonomously.

# Instructions
1. **Target:** Accept epic ID from user.
2. **Artifact Applicability:** Check `.epics/EPIC-<id>/` and `.test-plans/` for generated design artifacts (Architecture, UX, QA Plan) to determine what actually needs reviewing.
3. **Architecture Review:** If `ARCHITECTURE.md` exists, execute `.agents/skills/architecture-review-auto/SKILL.md`.
4. **UX Design Review:** If `UX-DESIGN.md` or mockups exist, execute `.agents/skills/ux-design-review-auto/SKILL.md`.
5. **QA Plan Review:** If `TEST-PLAN.md` exists, execute `.agents/skills/qa-plan-review-auto/SKILL.md`.
6. **Cross-Artifact Consistency Check:** 
   - Verify that the `TEST-PLAN.md` covers the UI states mocked up in the `designs/` folder.
   - Verify that the `ARCHITECTURE.md` defines the backend services required for those UI mocks.
   - Output a `DESIGN-REVIEW.md` in `.epics/EPIC-<id>/reviews/` summarizing consistency gaps.
6. **Completion:** Suggest the user proceed to `/epic-implement-auto`.
