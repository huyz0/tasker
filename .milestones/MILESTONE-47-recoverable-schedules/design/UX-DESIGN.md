# M47 — Schedule recovery in existing run history

Use the current Schedules list/detail layout, shared font roles and semantic
status tones established in M51. No new navigation group, palette or typeface.
The task/workflow remains the object people open to inspect work. History task
links derive org/project from the schedule itself, even when another project is
selected in the organization-wide schedule list.

## Flow and states

A due or manual intent appears in Recent runs once admitted. Show a textual
outcome, trigger and admission time; optional due time distinguishes a late
schedule. Queued means waiting to create work; running means creating work;
interrupted means recovery will retry, never that an external agent stopped.
Use concrete labels: Waiting to create work, Creating work, and Creation
interrupted; recovery eligible after <time>. Show attempt count and next recovery
eligibility where present, separately from the schedule's Next run time. A created run
links to the original task, skipped explains previous work remains open, failed
shows a safe reason, and cancelled explains schedule deletion. Color supplements
these words: success for created, warning for skipped/interrupted, destructive
for failed, neutral for queued/running/cancelled. Use existing tone tokens.

Loading: retain the existing Loading runs state. Empty: It has not run yet.
Error: Could not load runs with Retry; permission denial must remain visible and
must not be described as an empty history. Successful background schedule events
refresh list/detail/history through the existing event mapping. While visible
history contains recoverable rows, poll source history every 15 seconds: a dead
worker emits no lease-expiry event. An expired running row becomes interrupted
with recovery eligibility; it must not say a retry actually started. Run now uses its
existing pending/error/status feedback; an interrupted result does not invite
repeated manual clicks as a recovery mechanism. Each click is a new intent; show this beside Run now. Its result feedback must
say Creation interrupted; recovery will retry when appropriate, not Ran now.

Visible help beside Pause says: Pause stops future scheduled runs; admitted
creation and retries continue. Run now remains available.

Visible help beside Delete says: Delete stops new runs and cancels pending
creation. Created tasks remain. If creation commits before deletion acquires
its lock, that task remains; do not promise cancellation of every running row.

Delete removes the schedule from normal navigation and cancels pending creation;
existing tasks remain. Retained history is available to authorized API/CLI users
by schedule ID. The browser keeps its existing NotFound behavior for a deleted
schedule bookmark; this milestone does not add an archive screen.

## Verification

A clock-controlled case loads running history, sends no more events, crosses
lease expiry and observes a source refetch and interrupted/eligible wording.
Component tests and stories cover queued/running/interrupted and terminal run
states, long safe details, empty/loading/error and denied reads. Check desktop
and narrow layouts for wrapping and named task links. Event mapping tests prove
normal schedule events invalidate the real query roots; reconnect recovery is
owned by completed M48. No fabricated source records or runtime engine states.

A regression selects project A, opens project B's schedule and verifies that its
created-task link carries B. This local history-link fix does not replace M53's
application-wide canonical-scope work.

## Off-feed refresh amendment — T04

The schedule collection is organization-wide, while the single AppShell feed
may be narrowed to the selected project. Keep the chosen scope. If a displayed
schedule is outside feed coverage, refresh its existing detail/history reads
every 15 seconds, including empty/terminal history. Refresh the organization
list at the same bounded interval while its feed is project-narrowed. No second
stream or new endpoint is needed. Stop fallback when the feed covers the
schedule, on unmount or on permission denial; errors remain visible. Background
query polling retains the query library's normal visibility behavior.

Terminal-only history stops polling when its stream covers the schedule. Pending
history still polls for silent lease expiry. M53 owns broader alignment between
resource scope, navigation and subscriptions; this local fallback keeps schedule
history truthful now.

Run now acknowledges accepted queued/running/interrupted requests and directs
people to authoritative Recent runs. Its acknowledgement must not permanently
claim the initial queued status after recovery has completed. Clear feedback
when changing schedules. Immediate terminal failures show their safe reason.

Acceptance: select A, open B with empty/terminal history, create B work elsewhere
without a B event, then observe refreshed history/detail within one interval.
The task link carries B. Covering B stops terminal fallback; closing detail or
losing permission stops detail/history polling. Loading/denied/error remain
distinct, and no accepted request is silently repeated.

Background reads must not unmount an open editor. Keep its typed draft mounted
when cached authorized detail exists, show a refresh error and Retry, and retain
the draft when the read recovers. Failed save state remains separate. Initial
failed/denied reads still show the existing unavailable state.
