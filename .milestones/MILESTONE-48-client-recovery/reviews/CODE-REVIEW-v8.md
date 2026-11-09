---
timestamp: 2026-11-09T08:52:00Z
decision: approved
---

# M48-T04 — Corrected browser and native journeys

Independent browser and native reviewers approved their corrected candidates.
No material findings remain from v7.

Correctness: browser tests require visible initial task data, a new successful
ListTasks request after the controlled recovery frame, and the rendered task
created through another real browser page. Scope replacement aborts the old
pending connection and keeps data in the new project. Offline polling exercises
the production fallback timer through browser-clock advancement. Native tests
run the compiled CLI through actual timeout, interrupt, idle MCP and masked
terminal cancellation boundaries.

Coverage: all four browser journeys pass. Removing reconnect reconciliation,
resync handling, old-stream abort or offline invalidation makes its respective
journey fail at the expected new-request/abort assertion; restored code passes
all four. Removing terminal restoration fails the committed native PTY test.
The native reviewer independently reran all four binary journeys successfully.
The browser reviewer inspected all fault and restored-run logs without changing
services or launching another browser.

Architecture: stream frames are controlled to make browser failures deterministic;
source RPCs/SQL remain real. Actual server overflow, tenant filtering and broker
transport have separate backend/socket evidence. No production UI component,
authorization path, dependency or public contract is added by these fixtures.

Security/lifecycle: observing from the background avoids focus-driven refresh
false positives. Test contexts contain the fetch interception. Native Start
immediately starts one waiter; cleanup cancels/kills and awaits it on failure.
Build execution is bounded; the unnecessary strict wall-time assertion was
removed. Linux ioctls use private PTYs and restore/close their state. Other
platforms retain the T03 cross-build evidence rather than claiming PTY execution.

```yaml
findings: []
```
