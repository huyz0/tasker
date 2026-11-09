---
timestamp: 2026-11-09T22:48:40Z
decision: approved
---

# T05 live handoff coverage and integration truth

Independent four-lens review approves coverage/docs with no blockers. Full35,
upgrade closure and applicable final-head CI remain completion/publication gates;
this review does not claim their pending results.

Correctness: real MCP HTTP calls reach loopback Connect with minted scopes and
actual handlers. One observed RPC path per tool is enforced. Literal BOM/Unicode/
NUL and encoded content retain stored representations under explicit prefixes;
metadata-only opt-in does not complete the task. Tasks-only omitted/false digests,
read-only writes, real foreign org/task/folder/artifact IDs and human-only unlink
are refused appropriately without changed relationships. Malformed inputs invoke
zero loopback RPCs. Destroying a create response yields an unknown client result;
discovery finds exactly one committed artifact and verifies its content without
another create. No exactly-once claim is introduced.

Coverage:61 focused MCP cases pass. The identical7-case/134-assertion socket suite
passes on SQLite and an owned random MySQL schema. Four restored production faults
fail end to end: lost default bound, dropped opt-in, wrong RPC and consumed BOM.
The deployed owned-runtime probe separately passes115 assertions. All3 final
Evidence browser journeys pass:21-link bounded review/summary/navigation, denied
then offline recovery, and actual worker output appearing through the15-second
open-pane poll while a person keeps writing and opens/returns from the artifact.

Architecture: no runtime behavior, new RPC/schema/store/runner or dependency is
added in T05. Accepted ADR0042 and TC001–010 remain the boundary. Examples match
the6 thin tools,20/100 paging,20-entry opt-in digest, UTF-16 creation bounds,
Unicode-point prefixes and exact UTF-8 storedBytes. Existing legacy full RPC
reads remain explicitly separate. CreateFolder is agent-capable through RPC,
without a new MCP adapter; unlink remains human-only.

Security: new harnesses use real current principals, not replaced authorization.
Temporary credentials stay memory-only, expire within one day and revoke finally.
Browser proof uses native fetch outside Playwright operations/tracing and passes
no minted plaintext through page.evaluate, APIRequestContext, assertions or
attachments. Owned MySQL schemas/sockets/pools and process environment are cleaned
up/restored finally. Data fixtures are local/owned; no original service or user
work is reset. Documentation distinguishes linking provenance from authorship,
current mutable references from snapshots, and provider records from completion
verification.

```yaml
findings: []
```
