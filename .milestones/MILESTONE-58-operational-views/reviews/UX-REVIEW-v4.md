---
timestamp: 2026-11-10T19:32:39Z
decision: rejected
---

# M58-T01 repaired table recovery and unchanged-view history

Reviewed the updated375dark and768light table captures and current native table/
recovery source. Prior UX versions are preserved. No browser, production code
or service was changed. The new captures preserve the readable responsive
toolbar and shared-width table, with the existing fonts and semantic palette.

The horizontally scrolled error concern is now confirmed and repaired: the
owner's real browser measured Try again offscreen before and within the
viewport after moving recovery outside the horizontal scrolling wrapper. The
permanent play tests this exact focus/visibility relationship. The earlier
capture-only limitation is therefore resolved for this correction, subject to
the still-running final matrices. Native sort controls and row announcements
remain appropriate.

One small but concrete navigation blocker remains. A shared URL may validly
spell an existing default explicitly: view=board or days=30. Pressing that
already-selected control currently adds a history entry solely to remove its
parameter. Back then appears to do nothing. The accepted design explicitly says
an unchanged selected control does not add an entry. Treat equivalent valid
default spellings as unchanged; keep Reset/malformed repair intentional.

This rejection is limited to the source-proven history case, not palette,
layout, authorization or the repaired table behavior. Add task/report history
proof and re-review. Final real-browser7 remainder,37-story matrices, full and
final-head gates remain pending; publication/completion is not assessed here.

```yaml
findings:
  - file: apps/gui/src/hooks/useOperationalView.ts
    line: 34
    severity: Medium
    comment: >-
      Clicking an already-selected default control from a valid explicit
      default URL pushes a visually identical history entry. Board with
      view=board and30 days with days=30 both reproduce this from the source.
      Preserve the unchanged-control policy across equivalent valid spellings
      and test that Back leaves the view rather than consuming a duplicate.
```
