---
timestamp: 2026-11-09T08:12:00Z
decision: approved
---

# M48-T03 — Corrected CLI request lifetimes

Independent read-only review approved the candidate and reran all four
auth/debug × timeout/cancellation error-body cases. No blocking findings remain.

Correctness: per-request deadlines inherit earlier parent deadlines and
cancellation. Page traversal receives a fresh budget per request. Recursive
command-context reset prevents a cancelled invocation from poisoning the next.
Non-200 body reads now preserve their error causes before status parsing;
partial error bodies cannot turn exit 7/130 into generic exit 1.

Coverage: accepted-but-stalled RPC cancellation first failed before context
propagation. Timeout/invalid-duration cases first failed before implementation.
MCP tests cover continuation after a timed-out message, idle beyond a request
budget, idle cancellation and active-request cancellation. A real generated
event subscription survives the unary budget and obeys parent cancellation.
Removing unary deadlines, MCP message deadlines, idle-input closure or recursive
context reset fails its regression. Restoring ignored error-body read errors
fails all four synchronized body-read cases. Full CLI/backend race suites pass.

Architecture: unary interception avoids timing the whole command or a streaming
session. Auth/debug/MCP HTTP reuse the same child-context helper. Native signal
handling has a bounded drain and explicit terminal restoration; isolated PTY
verification first exposed echo left disabled and passes after correction.
Windows amd64 and macOS arm64 cross-builds pass. Committed native journey
coverage, including the terminal case, remains T04 as planned.

Security: no new credential exposure, automatic mutation retries or false
guarantee of undoing committed work. Error causes remain available for correct
classification; one error line and request-ID correlation remain. Existing
dependencies suffice. Request/session/terminal behavior is documented in
ADR-0046 and the CLI reference.

```yaml
findings: []
```
