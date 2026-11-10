---
timestamp: 2026-11-10T17:57:51Z
decision: approved
---

# M57-T05 actual worker handoff, wire coverage and public guidance

Independent four-lens review covers the current T05 diff against T04 e09993b:
the real-socket generated-client case, claim-attempts browser journey, owned
fixture cleanup and agent-integration guidance. Existing ADR0043, accepted UX,
TC001–010 and prior review records remain the boundary. No production source,
service or test was changed or executed by this reviewer. No new UI is added,
so UX-v4 remains the rendered verdict.

## Correctness

The wire test crosses real authentication, generated codecs and actual handlers.
It verifies original keyed receipt replay, changed externalRunId rejection,
same-agent reclaim and stale fenced release before any handoff, delayed reports
against the original closed receipt, ordinary legacy omission, wrong owner/task/
organization refusals, agent-note author-only writes and actual human unassign
closure. Its final old-key replay checks that a historic receipt does not
reacquire ownership. Server teardown now awaits process exit before deleting the
owned fixture database, avoiding listener/database reuse races; predrain0 is
fixture configuration and does not change production shutdown behavior.

The browser journey uses real generated clients, real HTTP MCP and an explicitly
provided CLI binary when configured. The fallback exercises MCP and does not
pretend to prove a CLI run. Twenty preliminary receipts make history pagination
real; the final23 receipts contain distinct released/current generations. The
associated and uncorrelated source assertions check actual artifacts, notes and
usage. The old artifact's absence under the receipt filter is a meaningful
negative assertion. No source data or stream bytes are mocked.

The eventless proof establishes a current older-page cursor before unassignment,
checks that no immediate history read occurs, then requires canonical task
ownership to update and exactly that older cursor to refresh. It also checks
task reads increased, page2 remained, Summary text remained and focus stayed in
the editor. It does not infer assignment from receipt closure or claim an
external process stopped.

## Test fidelity and coverage

Reported socket11/47 with one separately opt-in streaming skip, both-dialect/
populated-upgrade85/427, actual CLI+MCP44.2s and MCP-only46.5s runs complement the
existing T02–T04 concurrency, rollback, scoped-cursor, authority-lifetime and
rendered tests. The missing release-fence and dropped report-filter faults
reportedly fail real assertions and were restored. The final CLI repeat is
still pending at review time. These reported runs were not independently rerun;
the review does not recast optional integrations as default-suite execution.

## Architecture and security

Runtime behavior remains T04's approved implementation. The new test setup uses
owned org/project/task/agent data and real permissions. Issuance registers an
agent ID and unique token name before requesting plaintext, so finally cleanup
can discover an issued token even when no token ID response was received.
Browser cleanup uses allSettled so one agent failure does not skip the other;
failed revocation is surfaced. The isolated wire database is removed only after
its server exits. Browser token material remains in Node process memory, never
the page DOM, and trace/video/screenshots are disabled for this test. CLI token
input uses process environment, debug is removed, credentials-file creation is
rejected and temporary files are removed. MCP uses a bounded request and refuses
redirects. Generic helper failures avoid printing the bearer or raw worker
responses. No production permissions, API, migration or dependency are expanded.

## Documentation

The guide distinguishes ownership facts from process outcome/liveness, retains
the release fence instead of advising an unsafe fallback, explains delayed
same-owner reports and immutable association, and keeps human notes read-only.
Read filters remain independent source permissions and usage totals remain
task-wide. New CLI command/flag examples match their actual bindings. Cursor
reset, stable history ordering and explicit page-all behavior are stated. The
old-writer rollback warning correctly separates wire decoding compatibility
from receipt-safe ownership writes. Durable winning-claim event records are
distinguished from eventual delivery rather than promising webhook receipt.

No blocking finding identified. Approval is limited to the reviewed source,
test fidelity, architecture/security and documentation. Final repeat/full36,
closure and actual final-head CI remain required; preliminary T04-head CI does
not establish those T05 results or authorize a completion claim.

```yaml
findings: []
```
