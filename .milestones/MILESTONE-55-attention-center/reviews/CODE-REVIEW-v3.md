# M55-T03 source review v3

- **Date**: 2026-11-10
- **Reviewer**: independent existing human_workflows_review agent, read-only
- **Decision**: changes requested
- **Scope**: Attention UI/access/return flow, route/switcher and deterministic previews. Rendered/browser/coverage/fault gates remain pending.

## Blocking flow finding

Back intent waits indefinitely for successful reconciliation. When the first
return refresh fails, accepted stale rows remain visible but the intent survives.
A later ordinary poll or recovery can restore old focus/scroll after the person
has moved on. Consume the initial return reconciliation on settlement, including
failure/denial with a useful fallback, or retire the pending intent on subsequent
interaction. Cover transient Back failure followed by background recovery and
denied Back followed by explicit Retry. Polling must never revive old intent.

## Preview corrections

SelectedProject currently includes Beta rows because its fixture ignores the
project parameter. Approval/stalled fixtures also alternate user actors, although
those source records are agent-held/requested. Make project fixtures scope-valid;
use mixed user/agent requesters only for questions. These are preview inaccuracies,
not production data leaks.

## Other lenses

Shared account+org authority epochs, explicit response recovery receipts, source
identity/paging, canonical task URLs, native group links and intentional
projectless selection match the accepted design. No new backend authority or
mutation state machine is introduced. Final rendered/accessibility/overflow,
actual browser workflows, deliberate faults and complete gates still apply.
