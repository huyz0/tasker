---
timestamp: 2026-11-09T12:24:11Z
decision: rejected
---

# M53 initial design review

Human review finds intentional projectless organization/team Memory conflicts
with the existing switcher's first-project auto-selection. Define settled effects,
cold/reload/history and explicit selector changes before implementation. Limit
Back/filter claims to existing URL-backed state (M58 owns new persistence), and
define clean-content dirty detection.

Reliability/agent reviews approve metadata field numbers and finite closed
selectors, but identify required acceptance details: extraCacheKey currently
binds count only, MCP enums reject closed, and summary-only empty-string allowance
must not weaken other strings. Actual stale-approval transaction behavior needs
wire proof; direct handlers may roll stale persistence back at runtime.

```yaml
findings:
  - file: apps/gui/src/components/layout/OrgProjectSwitcher.tsx
    line: 237
    severity: Medium
    comment: Define intentional projectless Memory versus auto-selection and explicit scope changes.
  - file: apps/backend/src/db/query-builder.ts
    line: 263
    severity: Medium
    comment: Position binding is separate from extraCacheKey count reuse and requires executable acceptance.
```
