---
timestamp: 2026-11-10T20:33:32Z
decision: approved
---

# M58-T05 settled live status-color assertions

Independent four-lens review covers only the ui-layout.spec.ts test repair in
feature/m58-status-style-ci. T02 design/backend work remains separate. Existing
review versions are preserved; no production source, tests, services or browsers
were changed or run by this reviewer. No new application UI requires a UX pass.

Correctness: the test now waits for the selected Table/Board aria-pressed state
before inspecting that mode. Table color sampling retries until getComputedStyle
returns a nonempty value from the live locator instead of accepting an empty
one-shot result during replacement. Board comparison uses Playwright toHaveCSS
against the exact recorded table color, retaining automatic locator resolution
through DOM replacement.

Coverage: all three status samples remain required and visible, the three-color
distinctness assertion is unchanged, and every Board badge must still equal
its corresponding table sample. No expected color, status, theme or viewport
case was dropped. No timeout override or configuration increase is introduced;
the polling and CSS equality use normal bounded expect deadlines. The reported
unmodified baseline reproduces three failures/three passes across six real theme
cases. Twenty corrected repeats and a restored wrong-board-color fault remain
pending at this review; their actual results must be recorded before closure.

Architecture/security: this changes test synchronization only. It introduces no
application behavior, policy, dependency, credential, request or data mutation
boundary. Existing seeded-work setup and actual rendered-color checks remain.
The scoped assertion repair matches the observed empty-style race rather than
substituting static class snapshots or ignoring color differences.

No blocking finding identified. Approved for source review only; repeat/fault,
required full checks and actual final-head publication gates remain separate.

```yaml
findings: []
```
