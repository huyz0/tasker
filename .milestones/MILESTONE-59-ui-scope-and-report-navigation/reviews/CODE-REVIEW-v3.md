---
timestamp: 2026-11-22T07:03:30Z
decision: approved
---
# M59-T02 implementation review

Correctness: ordinary fragment links identify exactly one current section and preserve the full query. Default Exceptions keeps Reports; selected Trends/Spend name their page heading. Unknown fragments recover explicitly without echoing input. Layout-timed focus follows raw-fragment transitions, while initial load and window-only changes retain focus. Components remain mounted so independent reads and the Flow type choice survive section changes.

Coverage: actual three-case unit red and real missing-link browser red precede the change. Source17bda23 passes18 Reports screen cases,10 trend cases,1770 GUI cases,105 browser cases (three existing skips),401 story audits and37 repository tasks. Direct/reload, malformed recovery, scope/window/history/focus, CFD return and fresh named-view application retaining Spend are exercised. Loading/empty/error/denied examples remain navigable. Old simultaneous-visibility expectations now enter the appropriate section rather than accepting hidden charts as visible success.

Architecture: ADR-0050 is followed. No new pathname, view-definition field, API, query enablement change or authorization allowlist is introduced. Native link semantics avoid an incomplete tab/arrow-key contract. The existing PageHeader toolbar wraps shared view controls.

Security: saved-view ownership/session/intent checks and server permission enforcement remain unchanged. Links retain the current authorized scope; raw fragments are never rendered as markup or echoed. The owned browser fixture cleans its generated views and does not retain credentials.

This approves T02 only; T03 presentation and the final combined-head gate remain required. No participant, manual screen-reader or local-runtime pass is inferred.

```yaml
findings: []
```
