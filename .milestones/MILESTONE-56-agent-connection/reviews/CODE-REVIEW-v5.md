---
timestamp: 2026-11-10T10:11:49Z
decision: rejected
---

# M56-T03 CORS and real-credential evidence harness review

Independent review of immutable d66c497 approves the narrow CORS amendment:
Authorization joins the existing request-header allowlist while allowed origins
remain explicit and unchanged. The real socket preflight regression checks the
permitted GUI origin and absence of reflected foreign origin. This enables the
intended cookie-free bearer probe without introducing wildcard credential access.

The browser journey disables trace/video/screenshots, uses Boolean comparisons
instead of secret-valued assertion diagnostics, and captures its admin cleanup
cookie before issuance. afterEach independently clears browser/clipboard state
and uses native HTTP revocation without depending on a surviving context. The
reported assertion/timeout artifact and active-token audits address the previous
context-closure failure. One remaining commit-before-receipt cleanup window needs
coverage and correction before approval of this real-token harness.

```yaml
findings:
  - severity: P2
    confidence: high
    path: apps/gui/tests/e2e/agent-connection.spec.ts
    lines: "5-8,43-48"
    problem: Cleanup skips a token created on the server if failure occurs before the response token ID is recorded.
    scenario: CreateAgentToken commits, but its response is withheld/lost or the test times out before response.json and owned.tokenId assignment; afterEach sees the empty ID and performs no revocation.
    required: Record the uniquely owned agent/token-name scope before issuance and discover/revoke matching metadata when the creation ID is unknown, without recovering or persisting plaintext.
    acceptance: Withhold or lose an actual committed issuance response before local ID assignment; the test must fail safely, artifacts contain no secret and fresh source inspection finds no active owned credential.
```

This is an owned test-resource cleanup gap, not a product authorization bypass.
The current post-receipt assertion/timeout proofs do not establish pre-receipt
cleanup. P3 transient copy is corrected, and exact bearer/no-cookie/refusal,
configuration, revocation and source-fault evidence otherwise remain relevant.
Final types,39-preview/full gates and T04 production/CLI/MCP proof remain pending.
No implementation files or services were changed by this reviewer. Earlier
CODE/ARCH/UX versions are preserved.
