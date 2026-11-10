---
timestamp: 2026-11-10T17:08:04Z
decision: rejected
---

# M57-T04 bounded history and report readers four-lens review

Independent review covers the T04 candidate against c9d4009, accepted ADR0043,
UX and TC008–010. This record preserves the finding in the candidate reviewed
before the author-only notes correction began. Its line anchor refers to that
candidate, not the concurrent corrected working copy. No production source,
design, journal, service or test was changed by this reviewer.

## Correctness and coverage

The bounded history reader uses deterministic claimedAt/ID ordering, SQL limits
before shaping, current scoped counts and task/org-bound cursors. Report filters
are read scope, not writer authority. Notes, usage and artifact reads retain their
ordinary independent permissions; task-wide totals remain labelled separately
from filtered records. Legacy All-artifact cursor restart behavior is preserved,
while the new report cursor is strict. CLI/MCP bindings expose actual fields
without inventing execution status.

The corrected GUI lifetime guards reject stale sibling receipts and cached or
canceled successes after authority loss. Task-read loss from history/usage and
Unauthenticated from any source fences the task scope; artifact/note-specific
denial stays local. Explicit fresh retry, including a paging denial, is required
before acceptance. Current-page-only history polling pauses with disclosure or
document visibility, and maxPages:1 bounds report paging. Exact task-query
revalidation after each actual successful visible history read also works on an
unchanged older page; it does not infer assignment from a closed receipt.

One concrete source-action mismatch blocks approval. The reviewed notes panel
offered human Edit/Delete and an edit form for agent-authored notes, while the
real backend permits only the exact authenticated agent author. Human-ID equality
with agentId cannot satisfy principal.kind === agent. The real rendered task
capture also displays these unusable controls. Mocked human edit-success cases
therefore verify an impossible production path. Keep the human view read-only
and explain agent authorship; retain existing agent API/CLI operations and do
not broaden server permissions.

## Architecture and security

The source-specific read boundary, persistent account/org/task denial epochs,
bounded noteType handoff query and additive wire fields match the amended ADR.
The eventless coherence amendment correctly rereads the canonical task instead
of mutating assignment from receipt history. Human Add link retains omitted
association and truthful outside-filter feedback. No authorization leak was
identified: the backend correctly refuses the impossible note writes. The
finding is an action-affordance and test-fidelity defect.

Reported native40/275, affected UI126/126, CLI/MCP and old-client proofs support
the reviewed paths. Reported themed browser/keyboard journeys, 57-story
228 accessibility/114 overflow checks, and the real older-page no-event proof
support the rendered and lifetime behavior. The latter retained page, draft and
focus after approximately30 seconds and reread task ownership. These runs were
not independently rerun. Add truthful human read-only regressions, including
equal human/agent IDs and missing agentName, before re-review. Final restored
fault checks/full36/final-head gates remain pending; this is not task completion.

```yaml
findings:
  - file: apps/gui/src/features/Tasks/TaskNotesPanel.tsx
    line: 55
    severity: Medium
    comment: >-
      In the pre-correction T04 candidate, every agent note exposes Edit/Delete
      to the human Task Details viewer. task_notes.handler.ts:55-59 requires
      principal.kind === agent and the exact author agentId, so these writes
      always fail for the GUI's human session, even when IDs happen to match.
      Remove the human mutation affordances, use truthful author-only guidance,
      and replace mocked human-success fixtures with real-policy regressions.
      This is not a server permission leak and requires no permission expansion.
```
