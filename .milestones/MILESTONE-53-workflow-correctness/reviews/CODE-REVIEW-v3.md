---
timestamp: 2026-11-09T15:17:15Z
decision: rejected
---

# M53-T03 search interaction revision record

This records independent early human review and rendered/browser findings from
the in-progress search candidate. Corrections have failing-before/passing-after
regressions; restored final gates and a later approval still gate completion.
Existing authorized backend search and optional ownership contracts do not change.

```yaml
findings:
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 324
    severity: medium
    comment: Options remain Tab stops while arrows are handled only by the input. Follow the aria-activedescendant pattern and keep option selection on input arrows.
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 305
    severity: medium
    comment: Retry unmounts its focused button during loading. Reproduce native focus and explicitly return it to the input before refetch.
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 170
    severity: medium
    comment: Application-default automatic retries leave interactive search showing Searching after a failed read. Expose the failure promptly and provide explicit Retry.
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 325
    severity: medium
    comment: A stationary pointer can receive mouse-enter when results remount and overwrite the initial keyboard selection after navigation. Selection should follow actual pointer movement.
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 280
    severity: medium
    comment: A scroll region containing only options removed from Tab order fails keyboard-access audit. Keep the bounded scroll owner accessible through the sticky input, with scroll padding for selected rows.
  - file: apps/gui/src/components/layout/GlobalSearch.tsx
    line: 350
    severity: low
    comment: Short Memory statements duplicate their title as a snippet. Omit an exactly identical snippet.
```

Current-query/org binding, explicit error separation, supported Memory routing and
scoped list destinations receive positive source review. Forty-five focused
checks and three actual browser journeys now pass; deliberate binding faults
fail. Full gates and the restored six-story theme/width sweep remain pending.
