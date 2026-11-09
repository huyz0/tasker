---
timestamp: 2026-11-09T18:34:12Z
decision: rejected
---

# M53-T07 broad palette and keyboard findings

Broad dark rendered evidence rejects the final catalogue until CODE-v10's
1.93:1/1.83:1 standalone error contrast and keyboard scroll targets are corrected.
Some apparent scroll issues are Storybook runtime errors; fix providers/router
fixtures rather than styling the framework error screen. Independent palette
preflight recommends the existing destructive-subtle foreground for standalone
ink, preserving solid and highlighted foreground/fill pairs. No palette-family
or font replacement, global CSS override or lighter destructive fill is needed.

```yaml
findings:
  - file: apps/gui/src/features/Workflows/WorkflowEditor.tsx
    line: 1
    severity: high
    comment: Failed/refused text must remain readable on dark canvas and raised surfaces.
  - file: apps/gui/src/features/Reports/FleetScorecardCard.tsx
    line: 76
    severity: medium
    comment: Keyboard readers need a named focusable horizontal scroller with visible focus.
```
