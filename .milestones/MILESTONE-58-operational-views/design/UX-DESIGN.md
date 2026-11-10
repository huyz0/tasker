# Operational views — intent survives navigation

## Existing direction and scope

Keep the operational workspace, fonts, semantic color roles and responsive
layout already established by the independently researched M51 direction.
Its external references include [Vercel interface guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
and [NN/G local navigation](https://www.nngroup.com/articles/local-navigation/).
Use those as judgment, with actual Tasker flows as evidence; this is not a new
visual style or a reliance on the repository's design skill.

T01 changes existing controls' navigation behavior. It adds no new navigation
item, new filter language or report. Preserve the wrapping Tasks toolbar,
existing Board/Table choice, readable task detail and Reports window buttons.

## URL authority and history

The URL owns supported applied settings. It retains current org/project scope;
no previous local value, query cache or later-loaded saved definition replaces
that scope on entry. An absent setting uses the screen's existing default.

- Tasks: Board/Table, text filter, priority (including no priority), ready-only
  and supported table sort/direction. Board is the default; sort remains a table
  setting when returning to Board. Keep existing server-side paging/sorting.
- Reports:7/30/90-day window, default30, shared by exceptions, trends and spend.
- Opening/closing a task from the current list carries those list settings.
  Cross-screen links carry ordinary scope; Back returns to the original screen
  and its own settings rather than copying Tasks settings into Reports.
- Explicit control changes push history. Text typing replaces the current entry
  to avoid a Back step per keystroke; the existing query debounce remains.
  Back/Forward and reload restore values from the URL without an extra apply.
  The input keeps an immediate local editing value so router transitions cannot
  drop keystrokes. Applied queries still read the URL. Only a current live URL
  acknowledgement may resync that editing value; an older navigation cannot
  overwrite newer typing. There is no delayed text writer to resurrect intent.
- Filter/sort/mode or scope changes clear transient bulk selection. Drafts,
  dialogs, cursors, loaded pages and result snapshots do not become URL state.

Use bounded, known scalar values. Invalid/duplicate owned parameters safely
read as their defaults and show a compact neutral recovery message, with a
Reset view action. Reset clears only that screen's owned settings, preserving
org/project and unrelated parameters. Unknown unrelated parameters are not
interpreted as filters. Errors from actual data reads keep their existing
Retry/denial/empty distinctions; a malformed link is not an empty result.
Valid filters with no table matches say that explicitly, with Clear filters
preserving Table mode and sorting. Only an unfiltered empty project offers the
first-task prompt. Clicking an already-selected unchanged control adds no
duplicate history entry.

A stale callback must not navigate someone back to a screen they left or
restore its prior scope. Reuse the existing live-router-location rule for
writers, patch the actual current URL, and guard the intended screen. Authorized
entity scope normalization preserves scalar view settings; explicit scope
selection still leaves incompatible detail in one navigation.

## Named definitions — later tasks

T02/T03 add named query definitions, not snapshots or access rights. Personal is
the default and creator-only. Explicit organization-shared editing uses the
existing server admin policy. Save/load/use validates supported fields and
referenced resources; ownership and organization are derived/authorized by the
server. A definition is applied only through an explicit Open action that
updates the URL. A list arriving later cannot silently apply it.

The Save/Open/Rename/Delete interaction and obsolete-resource recovery get their
concrete design before T02/T03 implementation. Do not advertise those unfinished
controls in T01. The URL parser/writer must permit applying a whole supported
query in one navigation rather than a chain of partial writes.

## Rendered and runtime checks

Table sort headers contain native keyboard-operable buttons and announce the
current sort direction. Recovery messages/actions stay outside the horizontal
scroller so they remain reachable after scrolling a wide table. Full filtered
row counts belong to the table, including
its header, and virtual rows expose their positions. Cover Table empty/loading/
denied states as well as populated rows.

Cover default, populated filtered, malformed/recovery, loading, error and denied
states. Keep native controls and visible focus. Verify task open/close, report
links and Back/Forward at375/768/1280px in both themes, with real request fields,
reloads and no toolbar overflow. Retain current Summary/notes/report lifetime
and ownership behavior; URLs confer no extra authority.

## Named view interaction — T02/T03

Use the existing task toolbar/report header action area; add no sidebar route.
A compact Saved views control opens a dialog with Personal and Organization
sections for the current organization/screen. Each section has independent
bounded Previous/Next pages and cursor history, a count of views shown/total,
and a name filter. Name filtering is local dialog intent, debounces its catalog
read and resets that section to page one; it never changes the Tasks text filter
or applies a saved definition. Never fetch all pages or retain an ever-growing
appended catalog. Empty copy is based on that section's own authoritative count,
not whichever mixed-audience rows happen to appear on a union's first page.

Page loading/error/Retry stays within its section and current page. Disable
page actions while pending, preserve visible context and name drafts, and reset
page histories on organization/screen/filter changes or successful catalog
writes. A section switch/page response cannot discard a Save/Rename draft or
apply a row. Cover a personal and shared entry beyond the first100 records,
independent section paging, filtered totals and a page-read failure/retry.

Each row has a readable name and project context where currently authorized.
Org:read does not imply project:read: only show a current project name obtained
under its actual metadata permission. Otherwise use a generic Saved project or
Unavailable project context; do not expose an unauthorized name or require a
raw UUID to distinguish entries. Fresh Open still requires the screen's actual
source-read permission. Show unavailable project/definition
state explicitly. Names are organization/screen unique within each audience,
so entries do not rely on truncated names or raw UUIDs for distinction.

Save view captures the currently applied URL settings, opens a labelled Name
field and defaults to Personal. Organization is a deliberate choice available
only with current server-checked administration; the server still checks it on
submit. Explain the audience in ordinary language. Save creates a new name;
duplicate-name feedback stays in the dialog for correction. Empty/control/
overlong names cannot submit. Preserve the editing name on recoverable errors.
Cancel closes without writing or changing the URL and returns focus to its
invoker. Pending submission prevents duplicate actions.

Open is an explicit row action. A fresh authorized read either applies the
whole supported definition and its project in one navigation, or leaves the
current screen/settings intact with an actionable error. A catalog loading,
refreshing or arriving late never applies anything. Opening a definition from
another project is intentional and names that project when authorized; it does
not reuse an unvalidated target from local cache. Capture current account/org/
URL intent so a delayed Open cannot overwrite subsequent typing or navigation.

Rename edits a label only; audience, owner and stored query remain unchanged.
Delete confirms removal of the named configuration. Personal rows are editable
only by their creator; organization rows require current server administration,
including when the creator's earlier admin permission was revoked. Other users
can open readable organization views but see no misleading editing actions.
The server-derived canEdit state is refreshed and never substitutes for server
checks. Read-only organization entries retain their visible audience label.

Empty sections explain how Save view adds a name. Loading has a clear status;
read errors offer Retry, and denied access remains a denial rather than an empty
collection. Failed Open/rename/delete keeps useful context. A concurrently
deleted name can be dismissed and its catalog refreshed. An obsolete project
or definition offers recovery without navigating: retain current valid settings,
allow authorized cleanup, and offer Save current view under a new name. A
missing referenced project is never silently replaced with the active project.

Keep current semantic colors, typography, wrapping controls and shared Dialog/
confirmation patterns. On a phone, each row wraps name/context above actions;
use ordinary vertical scrolling, visible keyboard focus and named controls.
Verify empty/loading/error/denied/read-only/editable/duplicate/obsolete and
pending states in both themes, with keyboard/focus and375px overflow checks.

### T03 concrete controls and empty-catalog authority

One Saved views button in the existing wrapping toolbar/header opens the shared
Dialog. A Save current view action opens its name/audience form without adding
a second persistent screen toolbar action. Personal and Organization sections
keep separate bounded page/filter/error state, while the current form and name
remain mounted. Labels identify each row's audience and authorized project
context; Open, Rename and Delete are native named buttons. Delete uses an
explicit confirmation with its consequence and permanence text.

Organization audience is offered only after fresh catalog metadata explicitly
reports canCreateShared true from current org:admin. Empty catalogs still carry
that policy fact; older servers with no hint keep Personal. It is never a client
role guess or a grant, and submit always earns the server policy again. Read
failure/denial cannot present a stale previous-account permission. All pending
Open callbacks capture the live account/org/screen/URL intent and dialog lifetime.
A typed filter or navigation after Open makes that response obsolete, even if
its original screen remains mounted or a request ignores abort.

A permission denial from either audience's catalog is an organization-read loss,
so latch it for that dialog generation. Hide both catalogs, block an already
pending Open and disable remote writes while preserving the naming draft.
Refresh lists starts new bounded reads in a new generation; old sibling results
cannot reopen the denied generation. A source-specific Get refusal stays local
and does not infer lost org metadata access. Session check failures have Retry
session rather than claiming sign-out. An empty page with a positive count, or
without a PageResponse, offers Previous/Refresh instead of claiming an empty
collection. Present-page legacy totalCount is an int32 scalar with a zero default;
do not claim absence detection that its checked-in wire format cannot express.

Confirmation identifies the name, audience and currently authorized project
context. Keep its action heading fixed and wrap the name at operational body
size, including128-character names, so identity remains readable without a huge
heading or horizontal scrolling. Neutral/primary/destructive controls retain
their corresponding semantic foreground/background pairs during native hover.

Starting access retry does not restore authority. A revoked dialog keeps writes
blocked through unavailable/pending reads until both current-generation audience
reads succeed. An explicit refusal invalidates all administrative reads already
in flight; only a later fresh proof can reenable a retained shared edit/delete.
Legacy shared-row canEdit remains sufficient for editing that immutable shared
audience, while missing creation hints still keep new saves Personal. Check
editing access rereads bounded metadata without requiring the obsolete project's
source data or discarding a naming draft. The vertical body remains keyboard
focusable when pending controls are disabled.
