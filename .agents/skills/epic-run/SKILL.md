---
name: epic-run
description: Drives an epic through define, design, design-review, implement and implement-review, one phase at a time or end to end. Use when a milestone task is large enough to need architecture, UX and a test plan before code.
---

# Role
Engineering Director.

# Goal
Carry an epic from an idea to reviewed, tested, working code, with every phase
transition recorded in `EPIC.md` frontmatter so any session can resume it.

# Constraints
- Follow `@.agents/protocols/work-ledger.md` to resolve every artifact path. Never hardcode `.epics/`.
- Follow `@.agents/protocols/autonomy.md`, `@.agents/protocols/verification-gates.md` and `@.agents/protocols/response-style.md`.
- MUST NOT advance a phase whose predecessor's frontmatter is not `completed`, `approved` or `n/a`. That is a pre-flight gate.
- MUST NOT mark a review `approved` without the review document physically existing at the ledger path. Frontmatter is a record of work, not a substitute for it.
- MUST NOT check off a task without its tests (`*.test.tsx`, `*.spec.ts`) and, for new UI, its stories (`*.stories.tsx`) written and passing.
- MUST NOT simulate implementation. Generated code that was never run is a failure state.
- MUST record a divergence in `EPIC.md` when the real change touches files the plan did not name.
- Set a phase to `n/a` in **both** `designs` and `design_reviews` when it genuinely does not apply — never leave it `pending` to skip it.
- Autonomous mode treats an automated review as sufficient approval to proceed; it does not lower the bar the review applies.

# Instructions

1. **Resolve the target.** An epic id continues that epic; a topic starts a new
   one at `max(existing id) + 1` across the live and archive trees.
2. **Read `EPIC.md` frontmatter** to find the current phase. The first phase whose
   status is not `completed`/`approved`/`n/a` is the one to run. A `rejected`
   review outranks everything — enter recovery on the newest `-v[N].md` trace.
3. **Load context** via `context-inject` for the phase's surface. Never load all
   of `.specs/`.
4. **Run the phase** from its reference. Read only the one you are about to run.

   | Phase | Reference | Produces | Frontmatter |
   |---|---|---|---|
   | define | `references/phase-define.md` | `EPIC.md` | `status: todo` |
   | design | `references/phase-design.md` | architecture, UX, test plan | `designs.*` |
   | design-review | `references/phase-review.md` | `ARCH/UX/QA-PLAN-REVIEW-v{N}.md` | `design_reviews.*` |
   | implement | `references/phase-implement.md` | code, tests, stories | task boxes |
   | implement-review | `references/phase-review.md` | `CODE/QA/ARCH-CODE/SECURITY-REVIEW-v{N}.md` | `reviews.*` |

5. **Gate the transition.** A phase is done only when its artifacts exist and its
   frontmatter says so. On a `rejected` review, return to the producing phase
   with the findings; after two consecutive rejections, escalate and stop.
6. **Continue or stop.**
   - Single-phase call: report and stop, naming the next command.
   - End-to-end call: proceed to the next phase without asking, and do not stop
     for human review between phases.
7. **Finalize** when every `designs`, `design_reviews` and `reviews` field is
   `completed`/`approved`/`n/a` and every task box is checked: set
   `status: done`. Then `epic-archive` compresses it out of the working set.

# Output Format

```
EPIC-0021 Repository Webhooks — phase: implement-review

  Ran:      implement-review (single pass: code, QA, architecture, security)
  Wrote:    .epics/EPIC-0021-repository-webhooks/reviews/CODE-REVIEW-v1.md
            ... SECURITY-REVIEW-v1.md
  Decision: rejected — 1 high (unscoped org lookup in webhooks.handler.ts:88)
  Tasks:    11/12
  Next:     /epic-run EPIC-0021   (recovery on CODE-REVIEW-v1)
```
