# M55 — Attention Center design

## Judgment and evidence

Build a focused triage screen for current source work. Retain the independently
reviewed type roles, font family, violet action accent, semantic surfaces/ink,
spacing and focus treatment. A new palette or display font would weaken the
shared workbench language without helping people find/resolve attention.

External references read2026-11-09 inform judgment rather than dictate a skin:

- [Carbon notifications](https://carbondesignsystem.com/components/notification/usage/): explain outcomes and place a relevant action near its context. Personal notification history/read state stays in the existing bell; attention uses current task sources, with neutral normal-state surfaces and destructive ink only for actual errors.
- [GOV.UK task lists](https://design-system.service.gov.uk/components/task-list/): people need understandable labels and control over order in complex work. This changing queue has no fixed completion denominator, so avoid a checklist/progress meter or global all-clear claim based on one group's empty page.
- [WCAG2.2 focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html): focused actions must remain visible. Keep one primary scroll owner, wrapping controls and existing drawer/dialog behavior rather than accumulating sticky toolbars.

Source preflight distinguishes current-user reviews from approval outcomes,
no-recent-task-activity from agent death, and task creation from an unrecorded
review assignment date. Current unassign cannot safely release an old-row hold.
Use Open task for contextual inspection/actions, without inventing inline Resolve.

## Navigation and scope

Add Attention to Work navigation after Dashboard, before Tasks. Route /attention
uses existing org/project URL scope plus screen-local kind (question, approval,
review, stalled_claim); default question. Use native links/aria-current for source
navigation, not a pretend tab widget with custom keyboard rules. The source
selector is four compact links, wrapping2×2 at375px and one row on desktop.
Each shows the source label and its last-read count or an explicit unknown/error
state. The active source has a clear primary accent and programmatic current state.

Current organization is required. Project is optional: missing project means All
projects in this organization on Attention. Extend the switcher's intentional
projectless policy for this route, preserving Memory behavior. Provide an explicit
All projects choice and label it accurately; do not silently auto-select the
first project. A link from a project-scoped workbench keeps that project until
the user chooses otherwise. Missing org prompts selection with no source RPC.
Scope changes reset source intent/pages under new account/org/project keys.

Every row carries its actual project label and a canonical task link containing
that authorized org/project, never the current selector's borrowed project.
Open task pushes history; canonical normalization retains M53 behavior. Back
returns to the exact attention kind/scope, loaded extent and useful scroll/focus
position. Preserve a scoped in-memory return anchor/scroll position; restore once
after current data is ready, never on ordinary polling. If the old row resolved,
return focus to the group heading/nearby current row. Do not claim that the task
link opens a particular question or approval inside its existing panels.

## Screen and rows

Page heading Attention, subtitle describing current work in the chosen scope,
then source navigation, the active group heading/description, Refresh, loaded/
total label and compact rows. No giant card grid, ornamental charts or red
urgency blanket. Use type-page-title/type-section-title/type-body/type-caption
roles, min-width0/wrapping metadata and p-panel/gap tokens; do not shrink fonts.

| Group label | Reason/context | Age/owner label | Next action and drain rule |
| --- | --- | --- | --- |
| Questions | Bounded question preview, task title/status and project | Asked at; Asked by agent/user or requester not recorded | Open task → existing Answer form; cancellation by an authorized CLI/RPC/other client also closes the source independently of task completion |
| Approvals | Requested move from/to states, task title/current state and project | Requested at; Requested by actor or unknown | Open task; existing Approve move/Reject/stale result governs closure |
| Your reviews | You are a reviewer on this open task; task/project | Task created; review assignment date not recorded; owner You | Open task; terminal task or removal of responsibility drains this view, without implying review approval |
| Stalled claims | No recent task activity beyond24h; task/project | No task activity since; Held by agent or unavailable holder | Open task; inspect current assignment; activity, terminal status or assignment removal drains it |

Question previews are explicitly excerpts if truncated. Linking to the task lets
people inspect full questions/options and existing pending/history pages. Multiple
sources on one task remain separate rows, with kind+source ID identity. Keep
review task-age and stalled silence-age labels distinct. Token liveness is not
shown as proof of task activity; avoid Agent stopped or Dead worker wording.
Archived task/project rows are absent from these actionable views. Restore can
return unresolved sources, while existing history remains on the task.

## Independent paging, state and freshness

Each source owns its cursor, count, loaded rows and page error. Initial reads are
bounded (20) and counts are source-derived; no client filtering of capped panels.
Selecting a source preserves its loaded extent in that scope. Label N loaded of
M; unknown counts stay unknown. Load more is explicit; a next-page failure retains
accepted rows with Retry loading more. Never auto-load all groups/pages.

Loading, empty, initial failure, stale refresh, next-page failure, denied access
and no selected org have different copy. A failed group does not become zero or
hide successful groups. Counts describe the last authorized read; a stale/error
label accompanies retained values. Avoid a global All caught up unless all source
truth is actually verified; group-local empty guidance is sufficient.

Poll only the visible active group's already-loaded metadata chain every15s;
initial bounded reads may obtain the other groups' counts. Focus/reconnect and
source mutations/events invalidate the relevant scoped groups. No new notification
state or feed is required. Refresh uses fresh first-page cursors, retains extent,
deduplicates source IDs and does not move focus or erase summary writing.

Known organization task-read loss (PermissionDenied/Unauthenticated) hides all groups' accepted metadata/counts because
the same organization task-read authority covers every project and group; it also stops automatic refetch and
stale activation. Later network errors, scope cycling/remounts, choosing another same-org project/All projects or global M48
invalidation cannot restore old authorized cache. An already-running group B
success arriving after group A denial also remains quarantined. Explicit Retry must obtain
fresh successful source responses from post-denial attempts before revealing
that group's data. Fence permission lifetime by verified account+organization,
not project; data query keys still include project. A NotFound for a missing/
archived project is local unavailability rather than organization permission
loss; hide that project's data without blocking another allowed project. A pre-denial in-flight response
is insufficient even if it arrives later and advances a response counter. Canceled
refetch returning cached isSuccess is insufficient. Cache/query identity includes
verified account, org, project/all-projects and kind. Late A responses/callbacks
cannot overwrite B's scope, selection, focus or scroll intent.

## Resolution through existing context

The screen introduces read/navigation controls, not new Answer/Decide/Review/
Unassign forms. Existing task controls provide Answer, approval decisions and task management;
question cancellation is available through the authorized CLI/RPC/other client,
not an invented GUI Cancel question action. These handlers enforce current task-write permissions and
transition rules; read-only people can still inspect allowed source context.
A review has no new Approve review outcome. Stalled rows offer no release promise
based on an old assignment. Current-task inspection preserves the existing exact
assignment-pair behavior until M57 introduces any generation correlation.

On answer/decision/task-status/reviewer/assignment settlement, invalidate attention
as well as original source keys. Refresh after failures that can durably close a
stale approval; preserve the existing notice and summary draft. On Back, refresh
current source truth and retain group/filter/loaded extent. Original question,
approval, Dashboard, Reports, Tasks and personal notification entry points stay
reachable; this page consolidates discovery rather than adding another inbox.

## Required previews and browser evidence

Show each kind with mixed projects/actors, custom states, missing actor/review
assignment date, long names/Unicode excerpts, over50 reachable items, empty,
loading, error, denied, stale/page retry and no-org/all-project scope. Every new/
changed UI component gets deterministic stories with real providers and completed
play lifecycle. Both themes at375/1280 must pass contrast/heading/focus/overflow.

Actual keyboard/mobile journeys open a different project's task, resolve through
existing controls, return with correct scope/pages/scroll/writing, and cover each
drain condition. Include archive/restore, delayed old scope/permission responses,
read-only/stale decisions, hidden polling and reconnect. Do not present stored
review assignments or old task activity as a new approval/liveness guarantee.
