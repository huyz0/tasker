---
timestamp: 2026-11-09T15:29:00Z
decision: approved
---

# M53-T03 current search and keyboard behavior

Independent human-workflow, product and agent/contract/security reviewers
approve the corrected source and tests. CODE-REVIEW-v3 findings are resolved.
The existing authorized search RPC and its contracts/permissions remain unchanged.

One normalized query/org predicate gates requests, visible data and Enter.
Query keys retain query/org identity and obsolete reads consume cancellation.
Initial/subsequent failures and denied cached reads show an error with explicit
Retry; interactive search does not inherit delayed automatic retry backoff.
Missing organization and whitespace never send invalid requests. All six existing
result types, including Memory, have explicit groups and supported routes.
Project/agent list destinations retain the searched organization/project intent;
resource/comment-parent routes reuse authorized canonical ownership resolution.

Visible group order drives arrows and aria-activedescendant. Options stay out of
Tab order, Retry focuses the input before its button unmounts, and actual pointer
movement controls hover selection. The bounded scroll owner includes the sticky
input and scroll padding, keeping both input and selected results visible.
Exactly duplicate snippets are omitted without accepting markup from the server.

Observed verification:

- All35 local checks pass (24 cached), including GUI1421/95.31% branches and the
  standalone build. Unchanged backend2180/zero failures/47 gated skips and CLI
  gate93.8% retain their completed validation; default gated network suites are
  not claimed as new executions.
- Forty-five focused search tests pass, including real debounce, query/org races,
  access-denial recovery, Tab/ShiftTab, Retry focus and application retry defaults.
- Deliberately trusting cached data, dropping query/org keys, sending empty-org
  requests and preserving whitespace all fail their behavioral regressions.
- Existing real SQLite search passes36 tests/73 assertions; MySQL passes6/16 across
  supported types, ranking, paging and belief filtering. The owned MySQL schema
  is prepared before timed cases; no timeout or production migration code changes.
- Three actual RPC/SQL browser journeys pass all six groups, scoped project/agent/
  Memory navigation, Back, Tab/arrows/scroll, immediate stale-Enter protection,
  subsequent failure and dark-mobile keyboard Retry with zero axe violations.
- A fresh GUI-directory Storybook build passes all six states ×2themes ×2widths
  with zero axe violations, and all six pass the375px overflow sweep. The earlier
  script-listing invocation/stale preview is explicitly excluded as evidence.

No font/palette/navigation destination or agent execution semantics change.
Final-head remote CI still gates the completed M53 milestone's publication.

```yaml
findings: []
```
