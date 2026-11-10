---
timestamp: 2026-11-10T07:26:53Z
decision: approved
---

# M56-T01 issued-credential architecture review

Independent review of ADR0049, the M56 UX design and TC001–009 against the
existing AuthService.GetIdentity, agent-scope vocabulary, token issuance and GUI
transport finds no blocking static-design issue.

GetIdentity already returns the authenticated agent/org/token/scopes without
requiring a new data scope. A dedicated bearer request with credentials omit and
redirect error avoids proving only the administrator session. Exact identity and
scope checks, sanitized failures and trusted build-time API configuration form a
coherent verification boundary. The same normalized endpoint must feed ordinary
requests, verification and copied configuration, preserving deployment prefixes.

Account/org/agent/revision lifetimes, frozen issuance variables, late-response
retirement and zero inactive mutation retention address one-time plaintext
ownership. Explicit reset/cleanup remains necessary even when issuance completes
after dismissal; TC004 covers that distinction. No new API, permission, migration,
dependency, stored secret or external execution claim is needed.

Coverage names cookie-fallback refusal, redirected/wrong identity, revocation,
expired/offline recovery, scoped late issuance, clipboard failures and actual
CLI/MCP use with finally revocation. These are implementation obligations, not
completed evidence. This task is static design under the TDD exception; runtime
source, security, rendered and final-head gates remain future work.

```yaml
findings: []
```
