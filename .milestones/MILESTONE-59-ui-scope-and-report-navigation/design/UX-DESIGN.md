# UI scope and report navigation design

## Source findings and judgment

The workflow and schedule lists read by organization while the global project
selector suggests a narrower scope. Schedule details name their own project;
the collection needs that context before opening a record.

Reports currently stacks exception/activity, spend and trend reads on one
long page. Its window controls are small; the shared PageHeader already has
a wrapping toolbar slot. Existing URL-view and saved-view adapters preserve
hashes, so fragments can select sections without changing contracts or
expanding client route allowlists.

The daily-spend image gives a generic period name and hover titles, but
does not expose each day's values as the chart kit's usual text alternative.
This is an accessibility gap to reproduce, not an axe-only assumption.

## Independent sources

- W3C APG tabs: <https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>.
  Actual tabs carry focus/arrow-key/panel contracts; automatic activation
  assumes sufficiently fast panels. This informs the alternative, not a
  rule that URL-backed tabs are impossible.
- Carbon tabs usage: <https://www.carbondesignsystem.com/building-blocks/core/components/tabs/guidelines>.
  Group related content with explicit labels. Our choice of native local
  navigation is product judgment based on browser history/link affordances.
- W3C target size: <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html>.
 44px is an enhanced LevelAAA design target for these controls, not the
  universal minimum required by LevelAA.
- W3C non-text content: <https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html>.
  Daily values need an equivalent text form; a period-only chart name does
  not convey the underlying cost data.

## T01 automation context

Keep list queries organization-wide. Describe that scope under the purpose
of each screen. Runs use the project shown in their start form; templates
with a locked project do not promise an unrestricted choice. Each schedule
row names its own project from existing accessible metadata, falling back
to its canonical ID when necessary. No new project reads or backend filter.

## T02 Reports flow

Use ordinary links in a named Report sections navigation:
Exceptions, Trends, Spend. Fragments are #exceptions/#trends/#spend; an absent
fragment defaults to Exceptions. Links preserve the complete current query.
Unknown fragments recover visibly to Exceptions without echoing raw input.

One visible section at a time. Keep the familiar Reports heading at the
default Exceptions entry; name Trends/Spend in the page heading when selected.
A named content region and current-location link identify every section. Keep the three query components mounted behind hidden
panels to preserve independent queries and local CFD selection. This does
not claim fewer requests. The active section remains navigable when another
read fails. Native link keyboard and new-tab affordances apply; do not add
tab roles or promise roving-arrow behavior.

Window and saved-view controls use PageHeader's wrapping toolbar. Existing
adapters retain the fragment when updating filters or applying a named view.
Back/Forward restores both the fragment and query. Section transitions focus
the current page heading; initial load and window-only changes do not steal
focus. Card headings remain one level below the page heading.

## T03 presentation

Retain one system sans family and monospace identifiers. Keep the current
violet/neutral/status palette and validated chart-series colors. Introduce
only a named24/32 numeric metric role matching existing spend emphasis;
body/label/caption/code use current roles. Preserve readable long values.

Use the existing44px row token for report navigation/window controls and
stretch the existing saved-view trigger in the same toolbar row. No global
density override. Add an accessible daily-spend table with day/cost/tokens/
report counts; do not rely on hover or color alone. Keep the visible table
usable in constrained widths without clipping financial values.

## State coverage and evidence

Render populated, empty, loading, error and permission-denied examples for
each report section. Test scope absence separately. Retain canonical scope
and current query across navigation; show explicit recovery for malformed
settings and fragments.

Capture before/after examples at320/375/768/1280px in light/dark, plus an
explicit200% text-size check. Assert actual control sizes, visible charts,
focus and overflow containment. Synthetic test data only; no credentials.

## Unmeasured user validation

Future participant tasks: identify a schedule's project, find stalled work,
compare trends, inspect spend, change the report window and return with
Back. Observe first-attempt success, wrong-scope assumptions and recovery.
Recruitment/results are outside this implementation batch. Automated checks
and this heuristic review are not a usability study.
