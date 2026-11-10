---
timestamp: 2026-11-10T12:14:42Z
decision: rejected
---

# M57-T01 claim-history interaction review

Ownership-only language, native disclosure, bounded older pages, recorded owner
snapshots and explicit All/receipt/ungrouped report scope are coherent. Existing
fonts/tokens and Summary/Evidence/history hierarchy need no redesign. Two source-
backed acceptance boundaries need policy before UI implementation.

```yaml
findings:
  - severity: P2
    confidence: high
    problem: Open history has no explicit refresh policy for remote unassignment or retention closure; current UnassignTask does not publish a domain event.
    required: Specify an existing-task event publication path or bounded visible refresh for current history, with hidden/unmount/access-loss cleanup. Do not assume an existing unassignment event is emitted.
    acceptance: Remote human unassignment/owner retention changes an already-open receipt to its recorded ended state without requiring an undiscoverable close/reopen; if polling is chosen, cover the no-event case and cleanup.
  - severity: P2
    confidence: high
    problem: Existing Add link creates an ungrouped artifact link, which disappears under a selected agent-receipt filter; the reader's receipt cannot authorize human writer association.
    required: Keep legacy omitted association but explain the ungrouped result and offer All reports or another explicit truthful transition. Never silently pass a viewed receipt as the human writer's attemptId.
    acceptance: From an agent-receipt view, a human links an artifact through existing controls; source association remains omitted, success is understandable/reachable and no owner association is fabricated. Preserve unlink policy and summary writing.
```

No runtime or rendered issue is claimed observed; this is static acceptance review
against current source behavior. No design/source/journal was edited and no
services were operated. Earlier ARCH records remain preserved.
