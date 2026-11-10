# M56 executable acceptance plan

Static ADR/UX review is T01. Runtime scenarios bind T02–T04; each new behavior
needs an observed regression or a restored deliberate fault. Existing token
expiration, scope policy, registration and revocation rules stay authoritative.

## TC-001 — Truthful registration (T02/T04, exit1)

Given a selected organization, when the agent screen opens, then list/primary/
pending/empty/error copy describes registration and external runtime ownership.
Given a successful create, then show the registered agent and its token next step
without asserting a running worker, even when its row is beyond loaded pages.
Given existing Tokens selection or Close, then one shared connection section
opens/closes with useful once-only focus return. Existing editing/archive actions
still work; own and remote agent changes reconcile recorded activity and current
selected identity labels.
Given no organization, loading, read error or denied administration, then show
accurate scoped guidance rather than an authorized empty/create state.

## TC-002 — Roles and non-secret intent (T02/T04, exit1)

Given no roles and a typed name, when Create a role is chosen, then use the
existing form and preserve the current registration draft. Given successful role
creation for still-current intent, then the new role can be selected. Given Cancel,
later role choice or account/org switch before completion, then old callbacks do
not reopen/overwrite current form or invalidate a borrowed scope. Given role
failure, then retained values and a useful retry remain accessible.

## TC-003 — Issuance and limits (T03/T04, exits2/4)

Given current administrator authority, when selecting token name/scopes/expiry,
then at least one explicit scope and current1–365-day validation govern submit;
blank expiry retains the90-day default. Given invalid/denied creation, then no
secret or verification success appears and non-secret input remains. Given a
pending issue, duplicate submit is prevented. Existing list/revoke behavior and
all eleven scope names remain aligned with the backend.

## TC-004 — One-time secret lifetime (T03/T04, exits2/4)

Given one successful issuance, when the panel reveals its secret, then only the
current account/org/agent/revision can show/copy it. Given dismiss, unmount,
replacement, scope change or confirmed logout, then plaintext/creation-response
retention and active verification are retired. Given late issue/verify success
or failure, then it cannot reveal old plaintext, reopen the panel or replace a
new credential's result. Given transient session error with retained confirmed
identity, then it is not treated as a different account. Given re-open after
loss, then show metadata and revoke/reissue guidance without recovering a secret.

## TC-005 — Accurate configuration and copy (T03/T04, exit2)

Given an issued token and configured API/org/optional project, when previewing
Shell/MCP stdio configuration, then show real scope/endpoint and a secret
placeholder. Given explicit Copy configuration, then the copied string contains
the exact token and valid escaped values for the existing CLI/MCP transport.
Given clipboard failure, then show actionable retry/manual token selection and
never claim successful copy. No copy/download happens automatically. Given a
trusted VITE_BACKEND_URL, then normal/verification/generated URLs agree and
preserve an API path prefix; malformed or credential-bearing configuration fails
clearly without leaking its value. The existing localhost default still works.

## TC-006 — Exact credential verification (T03/T04, exit3)

Given a newly issued secret, when Verify token is selected, then a fresh actual
GetIdentity request uses that bearer and credentials omit/redirect error rather
than the administrative transport. Given the expected agent/org/token/scopes,
then display the returned identity and completion time. Given a human response,
wrong identity/org/token/scopes or cached/late data, then no verified success is
established. Given another verify attempt, then only its current completed
response can establish success; errors contain no secret/request headers.

## TC-007 — Refusal and recovery (T03/T04, exits3/4)

Given invalid/revoked/expired token, when verifying even with a valid admin browser
session, then refuse without cookie fallback. Given network failure, redirect or
unavailable API, then show a useful non-success/retry state without unsafe origin
forwarding. Given successful verify then revocation or failed retry, then clear
current success appropriately. Given dismissal/scope replacement during request,
then abort and ignore later completion; no focus/status/draft theft occurs.

## TC-008 — Actual external client and attribution (T04, exits3/4)

Given a real owned registration/token, when the exact copied configuration is
used by CLI/MCP, then actual identity/org/scopes match and the allowed first task
read/note is attributed to that agent. Given an unauthorized scope, foreign org,
revoked/expired credential or a different backend, then fail accurately. Revoke
all minted test tokens in finally; use no raw token in traces/videos/screenshots,
logs/assertion diagnostics or persistent browser stores.

## TC-009 — Rendered/current-flow gates (T02–T04, exits1/2/4)

Given all populated/empty/loading/error/denied/one-time/copy/verification states,
when using keyboard at375/768/1280 in both themes, then labels, focus, hierarchy,
status ink and document overflow pass current rendered checks. Given registration,
token, back/cancel and scope journeys, then current actions remain usable. All
required local, standalone, source review and applicable final-head CI gates pass
before publication. No new dependency, permission, runner or stored secret is
introduced.
