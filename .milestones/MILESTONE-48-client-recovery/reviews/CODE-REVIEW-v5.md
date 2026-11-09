---
timestamp: 2026-11-09T08:10:00Z
decision: rejected
---

# M48-T03 — HTTP error-body lifetime review

Independent read-only review reran focused lifetime suites successfully and
approved the per-request/parent/stream/session/context/terminal boundaries, but
found an untested error path.

```yaml
findings:
  - file: apps/cli/cmd/auth.go
    line: 109
    severity: Medium
    comment: Ignoring io.ReadAll errors on non-200 responses discards deadline/cancellation classification when error headers arrive before a stalled body. Wrap the body-read error with %w before interpreting the status/body.
  - file: apps/cli/cmd/debug.go
    line: 82
    severity: Medium
    comment: The same discarded read error turns timeout/cancellation into generic exit 1 rather than 7/130. Add flushed error-body regressions for both helpers and both lifetimes.
```

Correctness otherwise passes: earlier parent deadlines/cancellation, fresh page
budgets and repeated command contexts. Unary interception preserves streams;
MCP keeps its session across bounded exchanges and cancels idle closable input.
Security review found no new credential exposure or unsafe automatic retry.
Explicit terminal restoration covers cancelled masked input.
