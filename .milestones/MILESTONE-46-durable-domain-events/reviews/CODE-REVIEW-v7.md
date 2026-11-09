---
timestamp: 2026-11-09T06:48:00Z
decision: approved
---

# M46-T05 — Recovery review after diagnostic correction

Independent read-only review approved all four lenses and reran the 11 relay
tests (43 assertions). No blocking findings remain.

Correctness: the consumer opens the configured DB_PATH. Independent process
crashes retain committed work and stable producer identity. A fresh transport
ID safely replays an existing reference. Fenced HTTP completion cannot regress
a successor. The broker restart resumes source and audit delivery.

Coverage: both dialects run the same real-process/real-broker scenario, including
a 1.1 MB source payload and HMAC verification. Controlled time advances leases
by 61 seconds; the test does not claim real elapsed expiry or throughput.
Checkpoint and Docker commands are bounded, early child exits fail promptly,
and each generated resource has independent cleanup. Required CI activation of
the crash/MySQL suite remains M49.

Architecture: native Moon comes from the existing official pinned platform
package. It preserves Node test execution and avoids the failing Proto download.
The Linux/X64 restriction matches every modified job. Bun also reads its
existing repository pin; the release workflow remains M49's responsibility.

Security: retry diagnostics retain only fixed database/phase descriptions and
validated driver codes. Actual DrizzleQueryError parameters and arbitrary
exception messages containing a private fixture are excluded in both delivery
modes. Restoring raw-message persistence fails the regression. Operations docs
match retention, manual replay and mixed-version/rollback boundaries.

```yaml
findings: []
```
