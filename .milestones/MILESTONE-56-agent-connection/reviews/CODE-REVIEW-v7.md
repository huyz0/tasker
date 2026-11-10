---
timestamp: 2026-11-10T11:30:14Z
decision: rejected
---

# M56-T04 external-client, build and guide review

Independent four-lens review inspected immutable8f9f60f against ADR0049 and
TC008–009. The copied configuration drives actual HTTP MCP identity/task reads,
agent-attributed notes and missing-scope refusal. Explicitly supplied CLI proof
uses an isolated credential path, sanitized subprocess failures and copied
environment; absence of that optional binary does not pretend to run stdio.
Known/unknown-response token cleanup, private failure-artifact handling and
independent browser/native cleanup retain previous approvals.

Revocation focus now recognizes its originating control or retiring credential
section, while preserving later input focus/writing. Guide scope, expiration,
project-default versus org authority, lost-secret, verification/last-use and
external runtime explanations match the current source. Pre-emission validation
shares the runtime URL policy and appropriately prevents invalid embedded
credentials from becoming client literals.

One build integration blocker remains in this checkpoint: deployment endpoint
configuration is not a declared cached GUI build input.

```yaml
findings:
  - severity: P2
    confidence: high
    path: apps/gui/moon.yml
    problem: gui:build declares source/file inputs but omits VITE_BACKEND_URL and Vite environment-file inputs, allowing a deployment-only endpoint change to reuse prior cached dist output.
    evidence: Read-only moon task gui:build --json reports cache true, inferInputs false and no environment inputs; .env files are also absent from its expanded input globs.
    required: Include the deployment variable and supported Vite env files in the build cache identity, or disable caching where configuration cannot be represented.
    acceptance: Build two distinct valid destinations without source changes through the supported Moon build path and inspect each output for its own endpoint; an invalid configured destination must still execute validation and emit no credential-bearing assets.
```

The direct Vite regression proves the validator hook but does not prove Moon
rebuilds when only deployment configuration changes. No two-configuration build
was run by this reviewer, so no stale artifact is claimed observed; the declared
cache dependency is the source finding. The new36-check/full/current rendered
matrices, production-origin and optional-CLI runs plus final-head CI remain
pending. No implementation files or services were changed. Earlier reviews remain
preserved; ARCH-v3 separately approves the shared build/runtime validation policy.
