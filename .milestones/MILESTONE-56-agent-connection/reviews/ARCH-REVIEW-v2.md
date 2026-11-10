---
timestamp: 2026-11-10T09:22:28Z
decision: approved
---

# M56 API destination architecture amendment

The proposed destination policy is approved: development defaults to
http://localhost:8080, production defaults to the current document's HTTP(S)
origin, and an explicit trusted build-time VITE_BACKEND_URL overrides either.
The backend already serves the embedded static GUI, so unconditional localhost
in a production browser would address the viewer's own machine rather than that
server. Same-origin production requests correct that deployment mismatch.

Keep one normalized base for ordinary transport, session/error requests,
exact-token verification and copied external configuration. Explicit overrides
must remain absolute HTTP(S), reject embedded credentials/query/fragment and
preserve a deployment path prefix. Invalid configured values must fail clearly
without echoing their contents or silently falling back. Do not derive API paths
from the current SPA route. A reverse proxy requiring a prefix needs the trusted
override documented; origin alone intentionally supplies no prefix. Verification
still omits cookies, rejects redirects and checks exact issued identity/scopes.

Required acceptance additions before implementation:

- Distinguish dev default, production default on a non-local origin/custom port,
  and explicit override in either mode. Production must not quietly fall back to
  localhost if a usable HTTP(S) document origin is unavailable.
- Prove ordinary requests, verification and serialized Shell/MCP configuration
  use the identical normalized endpoint, including trailing slash/prefix cases.
- Reject relative/unsupported-scheme, credential-bearing, query/fragment-bearing
  overrides, with sanitized failure text. Configuration remains deployment input,
  not an editable secret-probe destination.
- Run a built production GUI against its serving backend origin; retain dev and
  explicit-prefix coverage. Document worker reachability/CORS or mixed-content
  failures honestly instead of claiming that browser verification configures an
  external machine.

T04 real-secret evidence must also clear the token-bearing DOM before automatic
Playwright failure screenshots, in finally, with trace/video disabled. Token
revocation and DOM cleanup need independent/nested cleanup so one failing action
does not skip the other. Do not put secrets in assertion diagnostics or captured
tool arguments. A fake-secret deliberate failure should demonstrate the final
failure screenshot contains no token; no real credential is needed for that
capture-safety proof.

This approves an architecture amendment, not implemented endpoint behavior.
Update ADR0049/UX/test-plan policy before T03 implementation. No source or service
was changed; previous reviews remain preserved.

```yaml
findings: []
```
