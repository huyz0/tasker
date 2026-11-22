---
timestamp: 2026-11-22T07:36:30Z
decision: approved
---
# M59 live-location correction and combined implementation review

Correctness: the final candidate exposed a real rapid-window race. Source3ac8c9c reads the existing currentLocation protocol for ordinary section/recovery activation, so a committed window/scope cannot be replaced by an older rendered query. Modified clicks retain normal anchor behavior; selecting the current fragment adds no history, and a stale Reports handler cannot navigate after its live pathname has left Reports. Focus remains limited to fragment transitions, with independent queries and local Flow selection retained.

Coverage: the deterministic case first fails in137133257376 with days7 instead of the committed days90;18 earlier screen cases pass. The existing real browser failure is preserved without adding a wait after the90-day click. Corrected source passes19 screen cases and all1771 GUI cases,95.34% branches. All14 hosted checks pass, including105 real-browser cases with no retries and three existing skips,401 stories across both themes/two widths with zero axe violations, both native MySQL versions and all37 repository tasks in5m55.199s. Document spacing is normalized and the workspace gate passes.

Architecture: ADR-0050 is clarified around the existing live-URL ownership protocol. The fix changes only activation timing; no new path, dependency, view-definition field, API or authorization allowlist. Presentation remains the reviewed shared-font/token layout, contained daily/spend tables and wrapping shell/panel/control groups.

Security: links use the known Reports path and controlled fragment while preserving the current query. Server permission checks and saved-view session/ownership/intent guards remain authoritative. Synthetic layout data is separate from real scoped browser tests. No screenshot/base64 copying or temporary capture/export mechanism is carried forward after automatic approval review rejected that disclosure.

Rendered/source review: CODE-v1's overflow and text/action collision blocks are resolved by the recorded real DOM matrix and inspected source-run captures. CODE-v4 retains the historical presentation review; fresh source3ac8c9c also verifies the final numeric gutters and complete reflow/visibility/keyboard/overlap matrix without producing further review images. Written evidence records the image-retention and local/manual-AT/participant limits.

This revalidates T02 and the combined implementation. A fresh final three-task candidate must pass its own full pipeline before merge; this approval does not waive that publication gate.

```yaml
findings: []
```
