---
timestamp: 2026-11-10T17:08:04Z
decision: rejected
---

# M57-T04 rendered receipt and filtered report review

Reviewed actual proper-theme Task Details captures at375,768 and1280 widths,
including real-associated light/dark captures and real-eventless-reconciled.png.
The earlier real-eventless-unassignment.png documents the rejected stale-sidebar
behavior and is not treated as final rendered proof. Existing typography and
semantic palette were judged directly rather than using the repository design
skill as visual authority. No browser, service or production source was changed.

The receipt disclosure, native report-scope control and compact wrapping rows
fit the existing task hierarchy. Mobile presents a readable single column;
desktop preserves the working context and metadata columns. Filtered records
and Task-wide totals are labelled distinctly. Ownership end labels avoid claims
about execution success, failure or liveness. Bounded Older/Newer controls and
explicit Refresh make the visible-page boundary understandable. The reconciled
capture retains focused Summary writing while Assignee truthfully becomes
Unassigned; the reported real older-page journey preserves page/draft/focus.
No concrete clipping, font, palette or navigation blocker was identified in the
inspected final-theme evidence.

The pre-correction human Task Details capture still presents Edit/Delete on
Agent Notes. The backend author-only rule means neither action can succeed for
this viewer. An edit form invites writing that the product is guaranteed to
refuse. Present the notes as readable agent reports with concise author-only
guidance and keep authenticated agent operations in their existing clients.
This inherited affordance is part of the rewritten T04 surface and should be
corrected before approval; it is not a request for new editing permission.

This rejected version records the original finding even though the concurrent
working tree has begun removing the controls. A new source/test/rendered review
should assess that correction. Reported57-story accessibility/overflow and themed
keyboard journeys do not substitute for the remaining full36/final-head gates.

```yaml
findings:
  - file: apps/gui/src/features/Tasks/TaskNotesPanel.tsx
    line: 55
    severity: Medium
    comment: >-
      The pre-correction rendered human view offers agent-note Edit/Delete,
      although the server permits only the exact authenticated agent author.
      Remove these guaranteed-refusal actions and the human edit form, retain
      readable notes and concise author-only guidance, and refresh the rendered
      evidence after truthful human-policy regression tests pass.
```
