---
timestamp: 2026-11-09T05:30:00Z
decision: rejected
---

# M46-T04 — Initial activation review

Independent review found two blockers before task completion. Both are retained
here as the rejection record; v4 checks their corrections.

```yaml
findings:
  - file: apps/backend/src/lib/mutationInterceptor.ts
    line: 41
    severity: High
    comment: Before the admission guard, idle drain could resolve and a late unary mutation enter during pre-drain delay; shutdown would ignore its active promise.
  - file: apps/backend/src/lib/telemetry/otel.ts
    line: 164
    severity: High
    comment: Before sanitization, failSpan exported original Drizzle messages and exceptions containing SQL event parameters despite safe logger and error-ring output.
```

Correctness: stop admission and track native HTTP/actual RPC handler promises.
Coverage: add actual SIGTERM/pre-drain and tracing-secret regressions.
Architecture: no other blocking drift against ADR-0040 found.
Security: sanitize every tracing sink without mutating the thrown cause.
