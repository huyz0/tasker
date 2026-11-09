---
timestamp: 2026-11-09T18:34:12Z
decision: rejected
---

# M53-T07 broad dark catalogue findings

The216-story dark375 whole-body audit exposes real issues beyond the earlier
narrow v9 approval. It reports18 axe violations; several are the Storybook error
screen's own pre block, which the old root-only gate never inspected. Diagnose
those fixtures before attributing their errors to product UI. Expected null
Breadcrumb/Priority/Pagination states and alertdialog portals are not broken UI.

```yaml
findings:
  - file: apps/gui/src/features/Workflows/WorkflowEditor.tsx
    line: 1
    severity: high
    comment: Refused story standalone error text is1.93:1 in dark mode. Reuse readable semantic foreground ink; preserve destructive fill/foreground pairs.
  - file: apps/gui/src/components/ui/repositories/RepositoryIntegrationConfig.tsx
    line: 1
    severity: high
    comment: Default story error text is1.83:1 in dark mode. Apply the same standalone error-ink policy consistently across existing UI and hover states.
  - file: apps/gui/.storybook/preview.tsx
    line: 1
    severity: high
    comment: Several default screens lack a QueryClient; local MemoryRouter stories nest inside the global router. Error screens leave the audited root empty. Correct fixtures and make the gate fail runtime errors while auditing portals.
  - file: apps/gui/src/features/Reports/FleetScorecardCard.tsx
    line: 76
    severity: medium
    comment: Mobile horizontal table is not keyboard focusable. Preserve deliberate internal scrolling and add a named visible-focus keyboard target.
  - file: apps/gui/src/components/ui/RichMarkdownEditor.tsx
    line: 70
    severity: medium
    comment: Read-only toolbar horizontally scrolls while all controls are disabled, leaving no keyboard target. Use a truthful compact read-only toolbar state without disabled off-screen controls.
```
