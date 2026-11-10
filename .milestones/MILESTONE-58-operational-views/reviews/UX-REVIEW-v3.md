---
timestamp: 2026-11-10T19:22:11Z
decision: approved
---

# M58-T01 keyboard table correction — source UX review

Review covers the native sort controls, current-direction announcement, virtual
row positions and shared horizontal header/row scroll policy. Prior UX versions
are preserved. No implementation, browser or service was changed.

Native buttons within headers give keyboard users a real actionable control;
aria-sort communicates the current ordering without adding the triangle to its
name. Header and body sharing horizontal movement is the appropriate repair for
phone headers that could not be reached. The table keeps readable column widths
and existing fonts/palette rather than squeezing all fields into the viewport.
Loading, error and empty controls outside semantic rows retain truthful recovery.

Approved for the reviewed source UX amendment. The earlier dark375 and other
previously reviewed captures predate this layout correction and are not final
proof of it. The rerun currently records375 light success and an updated light
capture was inspected; it preserves the wrapping toolbar and readable table
surface. A static capture alone does not establish shared scrolling or native
keyboard reachability. The added permanent Tab/Space/viewport-bounds test is the
appropriate runtime assertion, with final outcome still pending at review time.

The implementation owner was asked to verify horizontally scrolled table to
error/empty recovery, because narrow ListState remains inside the horizontal
scroll container even though outside the semantic table. No actual failure is
claimed without rendered evidence. Final updated six-view captures, affected
accessibility/overflow matrices, full and final-head checks remain required;
this record is not final rendered-layout certification or task completion.

```yaml
findings: []
```
