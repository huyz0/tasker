---
timestamp: 2026-11-09T18:09:47Z
decision: approved
---

# M53-T07 existing human flows and dialog title boundary

Independent human-workflow source review approves the narrow primitive change;
notification navigation still consumes its server-provided scoped targetPath.
Four lenses find no remaining source blocker. Prior versioned reviews retain the
navigation, search, cursor/decision, draft/session and MCP boundary findings and
accepted corrections; this pass does not replace that evidence.

Independent reference: the [W3C dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
labels the container from its dialog title; header actions keep their own names.
This supports the boundary independently of repository design guidance.

Correctness: Radix.Title now labels the h2 alone. The same visual header retains
its independently named Edit/Delete/Close controls; hidden-title actions remain
outside sr-only. Focus order, Escape/backdrop/close, background masking and scroll
ownership retain their shared primitive behavior. The prior modal-masking claim
remains disproved; no masking workaround is introduced.

Coverage: an observed red returns Task Details Edit task instead of Task Details.
Both visible/hidden title action cases and the existing primitive/workbench suites
pass118 tests, with app TypeScript clean. The header-actions story requires the
exact portal dialog name and visible controls. Actual summary browser helpers
also require that exact name, rather than accepting appended action labels.

Twenty-three final browser journeys pass against owned8093 source/SQLite:

- Nine existing journeys: sign-in, organization, template/project, task/comment,
  search, archive, notification badge/list, scoped destination and persisted read
  state after hard reload.
- Fourteen M53 regressions: task/artifact search ownership and history/reload;
  project/org/team Memory tiers; independent task/org pending/history pages,
  failed-page typing and stale persistence; six-type/current-query search and
  keyboard Retry; every supported draft exit/scope switch, held/failed save,
  Clear and native Stay/Leave with closed panels.

A live owned-backend MCP proof additionally traverses HTTP→loopback RPC→SQLite:
4000-character persistence, eight invalidParams refusals, read-only denial with
unchanged text and explicit-empty clearing pass. Temporary proof credentials are
revoked in finally without printing/saving their values. Exactly-one-RPC mapping
remains separately asserted by the protocol/loopback tests.

Architecture/security: the only production T07 change narrows a label boundary.
It creates no new endpoint, store, identity rule or authority. The observed real
owner/cursor/decision/draft/MCP boundaries retain their earlier both-dialect,
old-client, deliberate-fault and authorization evidence. Fonts, palette families,
layout owners and shared Radix behavior remain unchanged.

Testing setup failures are excluded: owned backend startup readiness, a temporary
forward-proxy decompression mismatch and seed's relative working directory are
corrected before the nine existing flows pass. Nesting that proxy with M53's
existing route forwarding yields403 and is stopped; the unchanged original M53
configuration then passes14. No application workaround or timeout increase.

Final rendered/full-source gates and actual final-head remote CI still gate task
completion/publication.

```yaml
findings: []
```
