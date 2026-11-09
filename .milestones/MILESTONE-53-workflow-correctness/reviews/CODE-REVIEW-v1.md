---
timestamp: 2026-11-09T13:55:00Z
decision: rejected
---

# M53-T02 implementation revision record

This records independent human-workflow/product review findings during the
312c163 WIP and its in-progress follow-ups. These findings blocked task closure;
corrections now have failing-before/passing-after regressions. A later approved
review must include restored full gates and rendered-state evidence.

```yaml
findings:
  - file: apps/gui/src/components/layout/OrgProjectSwitcher.tsx
    line: 288
    severity: medium
    comment: Selecting the already-active organization clears its project and can race initial auto-selection. Treat that selection as a no-op.
  - file: apps/gui/src/components/layout/OrgProjectSwitcher.tsx
    line: 232
    severity: medium
    comment: Single unkeyed labels can describe a previous owner when canonical organization/project IDs are absent from the current result page. Key names by owner identity and use an honest fallback.
  - file: apps/gui/src/hooks/useScope.ts
    line: 204
    severity: medium
    comment: Previously accepted ownership hides later read failures. Show retryable transient errors and invalidate acceptance on known access loss until a fresh read succeeds, including denial followed by an unavailable retry.
  - file: apps/gui/src/features/Tasks/index.tsx
    line: 1135
    severity: medium
    comment: Background ownership retry must also retry its failed legacy project dependency; artifact ownership has the equivalent project/folder dependency.
  - file: apps/gui/src/features/Artifacts/index.tsx
    line: 367
    severity: medium
    comment: The artifact trail lacks the owning project while a cross-project search destination changes scope. Include the authorized current project context.
```

Four lenses: current authorization/body bounds and optional contracts receive
backend/agent approval. Source/browser findings above concern truthful ownership,
error/retry transitions and regression completeness, with no claimed server-side
permission bypass. The final focused run passes64 cases; five real RPC/SQL
browser journeys and original-client JSON/protobuf reads pass. Full gates and
expanded light/dark mobile checks remain pending.
