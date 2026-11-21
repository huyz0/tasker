---
date: 2026-11-21
decision: approved
reviewed_head: 9dd19509897aef9d8f1ac7b4407f204da6708f37
---

# M58-T04 independent source review

Approved. No blocking findings in the new T04 changes.

The journeys use real generated clients, owned identities and native browser history. They meaningfully cover private-ID guessing, shared access and demotion recovery, retained drafts, bounded catalogs, obsolete-project refusal, and Reports project/window application.

The fault runner checks the expected guard before modifying it, requires the specific native assertion failure, disables retries, and restores source in finally before evaluating results. Generic infrastructure failures cannot satisfy the proof. CI runs strict browser typing and the fault proof before ordinary E2E.

Credentials remain in memory; recordings are disabled. Shared definitions are cleaned with the current administrator, personal definitions with their owners, and role/project changes are restored. Documentation accurately distinguishes definitions from access grants or result snapshots. T04 remains in progress, with parent publication and final checks explicitly pending.

**Nonblocking improvement:** Attach or clear the Reports request observer after reaching the seven-day baseline, immediately before Open. Attaching it while still on the initial 90-day page could let late initial-page traffic satisfy the fresh-Open request assertion.

At review time, exact-head run 44889085055 passed strict browser typing and the native fault-proof step. Ordinary E2E and other final checks remained running. This is source approval, not task-completion or merge approval.

Read-only GitHub review only; no files, services, tests or remote reviews were mutated.
