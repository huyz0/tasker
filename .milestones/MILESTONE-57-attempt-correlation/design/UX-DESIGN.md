# M57 — Claim receipts and associated reports

## Purpose and hierarchy

Answer who held a task, when ownership began/ended and which reports were
explicitly associated. Call the surface **Claim history**, with helper text:
“Ownership records, not external process status.” It lives in the existing task
detail context next to Evidence, outside Summary. Keep Summary → Evidence →
Claim history → Agent plan → Usage and cost; Agent Notes remains its current
source section. No new global navigation item or separate runner dashboard.

Use the current system sans type scale, mono IDs, spacing, surface/text/border
tokens and violet action color. A claim's open/closed ownership is plain labeled
metadata; do not add green success, red failure, spinners that imply a running
process, a progress bar or a new font. Normal content wraps at375px; long external
IDs wrap or use a labeled focusable code region rather than widen the document.

## History interaction

- The native disclosure is discoverable even when empty. It loads the first
  bounded receipt page on opening, with owner, claimed time, optional ownership
  end time/reason, short receipt ID and optional external correlation. Label
  absent release time “Ownership not recorded as ended,” not “Running.”
- Older/Newer claims controls move between bounded history pages and preserve
  useful page return state. Render one history page at a time. Show extent and
  next-page availability without claiming the first page is the whole history.
  Repeated clicks cannot duplicate requests.
- A receipt's Show associated reports action selects its ID in the existing task
  detail, updates the existing source sections and moves focus to the report
  scope heading only for that explicit action. Source reads do not steal focus.
- The report scope control offers All reports (default), Without claim receipt,
  or the selected receipt. The default retains existing complete source browsing;
  ungrouped legacy evidence is always reachable. Do not generate an unbounded
  dropdown by fetching every receipt. A selected loaded receipt remains labeled
  while its source pages load; clearing returns to All reports.
- Scope the existing Evidence, Agent Notes and usage-record lists using their
  independent bounded APIs. Do not duplicate artifact viewers/note bodies per
  receipt or fetch all reports and group them in the browser. Current task-wide
  Usage and cost totals retain that label when filtered records are shown.
- Preserve Summary drafts, current task/source navigation and existing artifact
  permission/freshness/provenance controls. A receipt filter grants no artifact
  access and does not imply its artifact reference is a historical snapshot.
- Viewing an agent's receipt does not make a human its report owner. Existing
  Add link continues its legacy unassociated write; never silently submit the
  reader's selected receipt. When the returned link is outside the selected
  filter, announce truthful success and offer Show all reports. Say “without a
  claim receipt” only when the returned link actually has no association; an
  existing link may retain a different receipt. Do not show a fake grouped row
  or leave a successful write apparently lost behind the filter.

## Truthful states

- Loading: “Loading claim history…” with an accessible status.
- Empty: “No recorded claims.” Explain that earlier claims may not have receipts;
  do not infer the task was never claimed. Empty filtered reports say no matching
  recorded reports, not that the owner did no work.
- Error: a scoped useful retry; no empty-success fallback. Later-page failure
  retains the last valid page and retries that page without dropping rows.
- Denied: remove current protected history/reports and disable source actions;
  do not reuse cached authority after task/account/org changes or confirmed
  denial. Require a fresh authorized read for the new access lifetime. Transient
  transport errors without known denial do not impersonate a logout.
- Legacy assignment: current assignment may exist without a receipt. Do not
  manufacture a claim time or hide that assignment. Human-created assignments
  remain assignment facts, outside this self-claim history.
- Released/reclaimed: old receipt stays visible; new receipt has its own ID.
  Delayed reports may appear under the old receipt and refresh its source list
  without moving to the currently held generation.
- Owner retention purge: show “Ownership ended when the owner was purged” and
  the recorded time. This is system cleanup, not a worker stop/outcome. Existing
  retention may have removed associated notes; the receipt does not assert that
  every originally submitted report remains available.

## Scope, keyboard and verification

Bind receipt selection, pagination and query/mutation lifetimes to confirmed
account + organization + task + association filter. Replacing task/scope clears
selection/pages and discards late completions; same-task cache reuse after known
denial cannot restore authority. Source event invalidation refreshes affected
lists rather than inferring execution outcomes from status events. Human
unassignment and owner retention currently have no task event: refresh the
current history page every30seconds only while the disclosure/document are
visible and access is current. Stop on collapse, hidden document, unmount,
scope change or known denial; never poll all cached pages. Offer explicit
Refresh and verify the no-event closure case.

Use native disclosure/buttons/select controls with visible labels, useful focus
return and polite loading/error announcements. Test keyboard at375/768/1280 in
both themes, including long names/IDs, partial pages, denied/retry and late scope
responses. UI stories and actual browser journeys must demonstrate an old claim,
reclaim, delayed owner report and ungrouped legacy report together before T04
is complete. No runtime UI is delivered by this T01 specification.
