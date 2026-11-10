---
timestamp: 2026-11-10T09:56:31Z
decision: approved
---

# M56-T03 authority-receipt and lost-secret amendment review

Independent source review of immutable eae76b3 finds CODE-v3's three blocking
findings resolved. Token metadata carries an account/org administration epoch
receipt; only an actual non-aborted response can produce a current receipt.
Pre-epoch success cannot authorize controls, and an old request's denial cannot
advance a newer epoch. Cached other-agent metadata remains fenced through panel
changes and transient failures until a fresh successful read.

Issuance freezes its epoch as well as UI revision, so denial/recovery batching
cannot reveal the old response before a retirement effect renders. Current
credential rendering also checks its epoch. A returned nonempty token ID is now
required. Existing metadata permanently explains that secrets cannot be recovered
and that lost tokens need revoke/reissue, independent of the retired component's
notice. Dedicated exact-bearer probe, sanitized errors, cookie omission/redirect
rejection and metadata-only mutation results retain the approved architecture.

One nonblocking wording refinement remains: transient refresh copy should only
claim a one-time token is available when the current credential holder exists.
The new permanent metadata guidance makes the no-recovery behavior explicit, so
this residual sentence does not reopen the source authority/secrecy blockers.

```yaml
findings:
  - severity: P3
    blocking: false
    path: apps/gui/src/features/Agents/AgentTokens.tsx
    lines: "161"
    problem: Transient metadata-error copy says the one-time token is still available even after reopening a metadata-only panel with no credential holder.
    suggested: Make the one-time-token sentence conditional on a current nonretired credential; otherwise describe retained last-read metadata and Retry.
```

Reported124 affected native cases include observed red/green receipt, late-issue,
lost-secret and empty-ID coverage; this reviewer did not independently rerun
them. Updated types, final rendered/fault/actual-token/browser/full and applicable
final-head gates remain required. No implementation files or services were
changed. CODE-v3 and prior reviews remain preserved.
