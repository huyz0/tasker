---
timestamp: 2026-11-10T11:30:14Z
decision: approved
---

# M56 pre-emission API destination validation consequence

Sharing the pure API destination validator between Vite configResolved and
runtime normalization is approved. Runtime rejection alone occurs after Vite can
serialize an invalid credential-bearing override into public JavaScript; rejecting
explicit invalid settings before asset emission closes that gap at the correct
boundary. A production origin remains a runtime default because the final served
origin is unavailable to the builder.

The amendment introduces no API, scope, migration, dependency or new destination
picker. Existing HTTP(S), no embedded credentials/query/fragment, path-prefix and
sanitized-error rules remain unchanged. The permanent build probe and deliberate
removed-hook failure are appropriate evidence for early validation. Deployment
configuration must also participate in build cache identity; CODE-v7 tracks the
checkpoint's missing cached-build inputs rather than changing this architecture.

This is static architecture approval, not final production/build closure. Current
full, production-origin, external-client and final-head gates still apply. No
implementation source or service was changed; earlier records are preserved.

```yaml
findings: []
```
