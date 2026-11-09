---
timestamp: 2026-11-09T17:35:00Z
decision: approved
---

# M53-T05 summary intent and session lifetime

Independent reliability and human-workflow re-review approve the corrected
source. CODE-v6 remains the record of the rejected verified-login, generation
and baseline behavior. Four lenses find no remaining source blocker.

Correctness: task/account/generation/entry/revision intent lives in session
memory, while TanStack MutationCache remains the network-write source. Save and
Clear capture their submission; exact success alone removes its editor. Newer,
reverted and reopened text survives old success; canonical response text advances
the existing same-account baseline without recreating entries. Live task-wide
pending admission prevents same-tick duplicates and remount/account collisions.
Foreign pending writes expose generic waiting copy, never their content.

Security: verified password login/register establishes its returned owner before
a held or failed session lookup. Account change cancels stale reads and clears
QueryCache while retaining pending write fences. Unknown lookup failure is not
logout. Confirmed logout/account change clears intent; explicit sign-out intent
rotates draft generation synchronously, blocks editing while pending and reports
failure honestly with Retry. Same-account older-generation receipts may advance
an existing baseline but cannot clear newer text; foreign receipts cannot.

Human workflow: every SPA exit retains task-specific intent; explicit Cancel
discards it. Restored context is discoverable. Pending/error state survives panel
unmount, and Clear has its own progress copy. A route-global beforeunload guard
warns only for changed intent, including closed panels, and reads live state.
Browser native warnings remain best effort; no mobile/process persistence claim.
Touched server errors preserve their explanation without Connect code prefixes.

Verification before full-gate closure:

- Observed regression reds cover task/unmount/save races, native warning,
  identity/session boundaries, logout failure, disclosure, canonical trimming,
  held/failed post-login lookup, malformed owner and cross-account shared tasks.
- Focused122 cases and a later6-case native/privacy suite pass; TypeScript passes.
  Four actual RPC/SQL browser journeys cover all modal exits, history, task and
  scope switches, held writes, failed-save remount, Clear and native Stay/Leave.
- Seventeen rendered states pass68 settled light/dark ×375/1280 axe audits and17
  mobile overflow checks. The actual375px dark failed-save capture is inspected.
  The drawer preview race is corrected so the audit sees the actual open drawer.
- Six deliberate faults fail: unconditional clearing, missing live admission,
  foreign receipt acceptance, unconditional native registration, account-only
  admission and unverified login-cache reuse. All source is restored.
- Remote T04 CI exposes an early timer wake. Two controlled scheduling reds
  drive a narrow absolute-deadline re-wait;44 stream tests pass, and removing
  post-wake authentication fails the credential test. Independent reliability
  approves heartbeat/credential deadlines, domain wake and abort cleanup.

No dependency, persistence, wire contract, font or palette-family addition.
Full-gate closure and final-head remote CI are still required for publication.

```yaml
findings: []
```
