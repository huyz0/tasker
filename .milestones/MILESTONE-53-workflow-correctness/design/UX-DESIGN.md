# M53 workflow correctness design

## Judgment and evidence

Keep M51's independently researched operational workspace: existing route names,
nav groups, system sans typography roles, semantic surfaces and violet interaction.
No new font, color family, primary navigation destination or decorative redesign.

Source inspection confirms three different intent failures: scope-change effects
close linked tasks/artifacts while ownership resolves; capped history hides old
pending questions/approvals; unkeyed summary state and unconditional save success
can discard or misattribute newer typing. Global search also drops belief hits
and turns failed queries into an apparent empty result.

Read 2026-11-09: [MDN replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState),
[MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event),
and [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
Use replace for normalization, attach unload warnings only while dirty, and
announce meaningful asynchronous outcomes without stealing focus. Native unload
warnings are best effort, especially on mobile; do not promise durable storage.
These references inform judgment and do not replace rendered/behavioral testing.

## Canonical ownership and navigation

The authorized resource determines ownership; the URL records it. A user opens
one destination with one push; resolving missing/conflicting scope replaces
that entry. Back returns to the actual origin, including its existing URL-backed project and screen parameters. M58 owns adding new URL-backed view persistence.
Reload/Forward retain the entity. Preserve unrelated valid screen parameters
and hash. A deliberate project/org switch closes an incompatible detail once,
using the selected destination scope; resolution is a distinct navigation cause.

Use current authorized resource metadata (ADR-0047). While resolving, show a
named loading state; do not label B as A or allow A-scoped resource actions.
On denied/not-found, show unavailable state and Retry where meaningful, with no
owner-derived labels or scope rewrite from a failed response. Ignore a resolution
that finishes after ID/route/account changes. Warm caches remain account-bound;
current read failure cannot authorize normalization from stale data alone.

Project-owned tasks/artifacts/beliefs align URL, selector, breadcrumb, source
queries, actions and the one live stream. Queues can use their already-authorized
projectId and org context to construct links; direct links still resolve safely.
Search comment hits resolve the parent task/artifact. Project results select that
project's supported list route; agent results use the supported organization list.
No invented project/agent detail screen.

Memory has explicit owner tier. Project beliefs select project tier/owning
project. Organization beliefs select organization tier/owning org and clear
project ownership from the canonical URL/breadcrumb. Team beliefs open an honest
detail-only team tier, with owning org/team attribution and no selected project;
no team browsing picker/list or project-scoped Record action is introduced.
Return from team detail goes to organization Memory; browser Back keeps origin.
The switcher recognizes intentional projectless organization/team Memory and
must not auto-select its first project after list queries settle. Cold reload
and Back/Forward keep that projectless detail without loops or extra entries.
Deliberately selecting a project closes the nonproject detail and opens that
project's Memory tier once; normalization cannot undo the explicit choice.
Deliberately selecting an organization closes the obsolete detail in the new
organization's appropriate list; stale resolution cannot restore the old org.
Direct belief resolution precedes list-only select-org/project guards. Existing
belief-owned edit/promotion/relation authorization remains authoritative.

## Search interaction

Render every supported task/artifact/project/agent/comment/belief type with an
explicit group label/icon and actionable route. Type grouping and keyboard order
must agree. New query/debounce shows current-query loading; failed initial or
subsequent reads show a readable error and Retry, never No matches. Old results
must not masquerade as the current failed query or capture Enter. Ignore late
responses for earlier query/org. Empty query is an invitation; successful zero
results is No matches. Escape, focus restoration and arrow/Enter behavior remain.

Fresh search research read2026-11-09: [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
and [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
Keep focus in the input while aria-activedescendant identifies the visible
suggestion; arrows and Enter follow displayed order. Searching, result counts
and no matches are status messages; a failed read is an explicit retryable error.
Require a selected organization before issuing a search. A missing scope is a
clear choose-organization state, never an invalid empty-org RPC. Preserve the
searched organization for supported project/agent list routes; project hits
select their project. Resource routes still resolve current authorized ownership.

## Actionable work and history

Task panels show separate Questions/Approvals sections: pending work first,
closed history in an explicit disclosure afterward. Each uses independent bounded
pages and keeps PageResponse. Pending is never gated on opening History. Empty
pending says no one is waiting; existing history remains reachable without
pretending the task never had questions. Closed-only history uses SQL selectors
from ADR-0047, not filtering one all-status page. Page sizes remain20 questions,
10 approvals; organization pending pages use 50 rows across all projects.

Use counts that say what they mean: Showing X of N pending where N is the
server's current total, not the number in a loaded preview. Load more, its
pending indicator and a local next-page Retry follow each section. Keep earlier
rows/forms on page failure; background refresh errors preserve typed answers
and expose an alert. Initial loading, true empty, denied and recoverable error
remain distinct. Disabled actions cannot imply a successful decision.

After answer/decision, reconcile pending, closed history, task counts and board
from source truth. Organization queues include projects outside the one selected
live feed, so refresh their bounded loaded pages every15s while visible. Stop
automatic retries after known access loss; keep the one shared stream. A cached
form may retain text, but its actions stay disabled after denied/authentication/
not-found responses, through transient failures and remount/scope return, until
a fresh successful read verifies access. Obsolete mutation callbacks cannot
replace the current task/organization's error notice. A last item disappearing must not strand later pages. Dedup
IDs when rows arrive during pagination; preserve server cursor identity. Scope,
task or selector changes reset only the relevant page sequence. Concurrent human
resolution uses the server's resulting status/error, with clear explanation;
no client-side fabricated answer or extra mutation retry.

## Summary intent and all exits

Choose task-keyed, account-bound session-memory drafts across SPA exits, with an
explicit Unsaved draft indication on restoration. Reject separate confirmations
for every nested close path: they are inconsistent and can conflict with existing
title/description guards. Existing guards for those fields remain in place.

Escape, backdrop, close, breadcrumbs/sidebar, scope switches, browser Back/Forward
and another task retain the summary draft for its original task. Opening B never
shows A's text/error. Background updates/read failures cannot erase the editor.
Cancel explicitly discards that local draft. Clear remains an explicit server
mutation; opening an editor does not submit anything. Save/error status belongs
to its task/account/request, including across unmounts.

A save captures task/account/text/draft revision. Success clears only that
submitted revision; newer typing remains dirty. Old A responses cannot clear B
or a new account's drafts. Prevent a second per-task save while an earlier one
is in flight, including after navigating away/back. Failed save preserves the
latest text and exposes Retry through the ordinary Save action. Use TanStack
mutation state rather than a second network-state implementation. Admission is
per task across session generations and accounts because the server has one
summary for a shared task. A foreign pending write exposes generic waiting copy;
its private text cannot influence the new account's dirty comparison or error.
Use canonical successful response text for the baseline, including server trim.
An older same-account receipt may advance an existing newer draft's baseline,
but only its exact generation/entry/revision may clear it; never recreate a
cancelled entry or apply another account's receipt.

Dirty means changed content relative to the edit baseline, not merely an open
editor. Opening unchanged text or typing and reverting is clean.

Native reload/tab close gets a beforeunload warning while any dirty retained
draft exists, even when its task panel is closed. The listener is removed when
clean. Choosing to leave discards in-memory drafts; this design does not persist
content in local/session storage or guarantee recovery after browser/process
termination. Logout/account change clears drafts and prevents old asynchronous
callbacks from recreating them for another identity. Logout intent rotates the
draft generation before awaiting the request; pending logout disables editing,
and a failed logout reports Retry without claiming the session ended. A verified
password-login/registration response establishes its returned identity before a
held/failed session refresh can reuse the previous account. Cancel stale reads
and clear read caches on account changes while retaining pending mutation fences.
A transient session lookup failure is unknown, not confirmed logout.

## Layout, palette, typography and states

Retain M51 shared page/section/body/label/caption/control/panel roles. Pending
cards use existing warning tones with text labels; errors use an existing
readable foreground/background pair, not text-destructive on a dark page (M47
measured1.93:1). History is quieter, not lower-contrast essential text. Load more
and Retry remain keyboard reachable; update/status announcements do not move
focus. Use one scroll owner within existing task dialogs; no new dialogs.

Test light/dark375/768/1280, realistic long titles/questions/answers and keyboard
flows. Verify accessible names/focus/contrast as well as document overflow.
Stories cover initial loading/empty/error/denied, populated pending/history,
next-page/background failure and retained draft/save states. No implementation
jargon or external-runner claims enter the product flows.
