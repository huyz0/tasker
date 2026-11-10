---
id: ADR-0049
status: accepted
date: 2026-11-10
milestone: M56
---

# Verify an issued agent credential through the existing identity API

## Context

The Agents screen creates an identity but calls the action deployment and refers
to running instances. AgentTokens issues a scoped secret once, then leaves worker
configuration and the first successful request implicit. Registration does not
start a process. AuthService.GetIdentity already accepts valid agent credentials
without an additional data scope and returns agent ID/name, organization, token
ID and scopes. The usual GUI transport includes the human session cookie.

ADR-0008 defines opaque, expiring, revocable tokens and one-time plaintext. M56
must prove the exact issued credential while preserving that boundary, current
account/organization scope and external runtime ownership. It must not interpret
an administrator's successful request or a copied snippet as worker liveness.

## Options

1. **Use the issued bearer credential with GetIdentity** (chosen). A dedicated
   transport omits browser cookies and rejects redirects. A successful response
   must identify the expected agent, organization, token ID and exact issued
   scopes. This reuses current authentication and revocation without a new RPC.
2. **Use the normal administrative client** (rejected). Its session cookie can
   authenticate the operator; successful token listing or identity reads do not
   prove the issued credential works. Mixing two identities obscures failure.
3. **Post the secret to a new administrative probe endpoint** (rejected). This
   creates another secret-handling and authorization surface when the identity
   API already answers the question. It does not establish external runtime health.
4. **Mark setup complete after Copy or registration** (rejected). Clipboard and
   identity creation cannot observe installation, authentication or a running
   external process. A staged progress bar would make an unsupported claim.

## Decision

Verify the exact newly issued bearer credential using a separate, cookie-free
GetIdentity request to the application's configured API, and show its successful
identity and completion time only within that credential's current UI lifetime.

The API destination comes from trusted deployment configuration, never an
editable token-probe URL. Support optional VITE_BACKEND_URL, with localhost:8080 in development and the
current document HTTP(S) origin in production. Normalize an absolute HTTP(S) URL
and reject embedded credentials/query/fragment. Production without a usable
HTTP(S) origin fails clearly; it never falls back to the viewer's localhost.
Reverse proxies requiring an API path prefix set the trusted override explicitly. The same configured base feeds ordinary transport,
credential verification and copied external configuration. An exported worker
configuration must use an absolute endpoint and preserve any deployment path
prefix. Configuration is intentionally a build-time deployment setting.

## Consequences

- No contract, scope, permission, token schema or migration changes. Existing
  admin authorization governs issuance/revocation; GetIdentity authenticates
  the issued token using its usual current validity checks.
- Verification uses Authorization Bearer, credentials omit, redirect error and
  an abort signal. It does not reuse global GUI authentication/error interceptors
  or put the secret in query keys, URLs, errors, logs or telemetry.
- A human response, mismatched agent/org/token/scopes, failed request, revoked
  token or stale completion cannot establish verified state. Starting a new
  verification clears its prior current result. The result records a request at
  a time, not continuing worker activity or authorization after that time.
- Local credential state is bound to confirmed account + organization + agent
  and an issuance revision. Dismissal, replacement, scope change, unmount and
  confirmed logout retire it, abort verification and discard late results.
  Transient session errors are not treated as confirmed account changes.
- Issuance sends frozen variables for its original scope. Late success may create
  a server token in that scope, but cannot reveal its plaintext in another scope
  or reopen a dismissed panel. Metadata remains manageable through the normal
  token list; a lost secret must be revoked/reissued, not recovered.
- Creation responses must not remain in a long-lived mutation cache after the
  one-time panel retires. Use zero inactive retention and clear/reset the local
  response holder. Verification stores no credential in query/mutation cache.
- Explicit Copy token/Copy configuration can place the secret on the user's
  clipboard. The visible configuration preview uses a placeholder, and copying
  is never automatic. Examples use JSON serialization or safe shell quoting.
- One connection panel outside virtualized rows accepts the returned registered
  agent or an existing Tokens selection, so the next step is reachable even when
  the new row lies outside loaded pages. No token panel is duplicated per row.
- Registration and token administration remain useful independently. Existing
  editing, archive, revoke and token-list metadata behaviors remain available.
