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
