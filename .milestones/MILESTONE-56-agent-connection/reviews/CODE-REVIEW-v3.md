---
timestamp: 2026-11-10T09:48:35Z
decision: rejected
---

# M56-T03 issued-credential source review

Independent four-lens review covers immutable1a58bd5 AgentTokens,
IssuedCredential, agentCredential/backendUrl and native fixtures/tests against
ADR0049, UX and TC003–007. Newer working-tree acceptance tests are not treated as
proof of a correction to that checkpoint. No implementation file was edited.

## Architecture and security

The separate GetIdentity client sends the exact bearer with credentials omit,
redirect error and an abort signal; it does not use administrative logging/error
interceptors. Agent/org/token/scope equality and rejection of human identity avoid
cookie-session proof substitution. Verification errors are sanitized and returned
state is metadata only. Issuance variables contain no secret, and its mutation
resolves without the secret-bearing response. Local holder/revision retirement,
cookie-free configured endpoint and shell/JSON escaping follow approved policy.
The production-origin/development-localhost/explicit-prefix helper is coherent.

## Correctness and coverage gaps

```yaml
findings:
  - severity: P2
    confidence: high
    path: apps/gui/src/features/Agents/AgentTokens.tsx
    lines: "109-121,136-138"
    problem: Known administration denial is not latched through a later transient metadata failure.
    scenario: Accept token rows, refresh into PermissionDenied, then refresh into Unavailable; the new error clears administrationDenied while cached rows remain, exposing New token/Revoke and possibly the retained form without a new authorized success.
    required: Preserve known administration loss through transient failure and remount until a newly accepted successful metadata response; cancellation returning old cached success must not qualify.
    acceptance: Exercise accepted→denied→unavailable, scope-return/remount and cancelled recovery with cached rows; keep metadata/forms unavailable until genuinely fresh success. Retain the separate ordinary transient-failure secret-preservation case.
  - severity: P2
    confidence: high
    path: apps/gui/src/features/Agents/AgentTokens.tsx
    lines: "137-138,217-220"
    problem: Lost-secret/revoke-reissue guidance exists only in a dismiss notice owned by the current component.
    scenario: Leave or dismiss the one-time panel, close/reopen connection setup or reload, then see metadata without the required explanation that its secret cannot be recovered.
    required: Provide truthful persistent metadata-only guidance independent of the old reveal component; make transient metadata-error copy conditional rather than claiming a one-time token is available when none exists.
    acceptance: Remount with only existing token metadata and prove no plaintext returns while revoke/reissue guidance remains visible.
  - severity: P2
    confidence: high
    path: apps/gui/src/features/Agents/AgentTokens.tsx
    lines: "94-96"
    problem: Issuance validation accepts an empty returned token ID even though exact-token verification and current-token reconciliation require that identity.
    required: Require a nonempty returned token ID before revealing a confirmable credential.
    acceptance: A malformed issuance response with empty ID shows sanitized failure, preserves non-secret input and reveals no plaintext.
```

The first finding is a client authority-lifetime defect, not a server permission
bypass. Existing tests cover immediate denial and ordinary transient metadata
failure separately; they do not establish the denied→transient cached-data case.
Reported helper/affected/type checks were not independently rerun. Actual issued
token/browser, rendered matrices, restored faults, full and final-head gates remain
pending. Prior CODE/ARCH/UX versions remain preserved.
