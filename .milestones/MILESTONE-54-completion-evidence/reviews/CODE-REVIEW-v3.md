---
timestamp: 2026-11-09T21:12:19Z
decision: approved
---

# M54-T03 source and opt-in boundary review

Independent agent/reliability reviews approve source with no blockers. Full35
checks still gate completion; this review does not claim they have passed.

Correctness: authorized task retrieval stays first. Omitted/false artifact opt-in
retains tasks-only access and performs no artifact query. Positive opt-in resolves
the actual task org and requires artifacts:read/artifact:read before reading links.
SQL selects21 raw links before20-entry metadata hydration, without bodies. New
artifact truncation is ORed with existing answered-question/relation caps. A
question-only overflow with empty evidence prevents one cap masking another.
Archived/unavailable behavior and sanitized nested names reuse the T02 reader.

Coverage:64 focused cases/1054 assertions and backend TSC pass. The real owned-
schema MySQL proof passes62 assertions, including ordinary/false scope, denied
opt-in and capped metadata. Seven restored faults fail: missing artifact authority,
widened default scope, unbounded source rows, lost artifact/existing truncation,
dropped MCP forwarding and a body transferred under metadata alias. Raw-row
tracing is extracted unchanged into a private shared test helper and used by
both artifact and digest boundary tests.

Architecture: fresh request field2 and TaskDigest field7 are additive. Current
TS/Go clients regenerate from the checked-in compatible proto. Existing442 TS
message descriptors/1241 fields remain unchanged; six old TS protobuf decodes
plus six old Go JSON/six protobuf decodes pass, including digest messages. MCP
still maps to exactly one existing GetTaskDigest RPC. No persisted digest, body
read, new event family, permission grant or completion enforcement is introduced.

Security: caller org hints are ignored, current resource ownership controls
scope, and artifact authority cannot expose a foreign task. Ordinary clients need
no new scope. Optional MCP input is typed and null/string/numeric misuse invokes
zero RPCs. Output is current mutable-reference metadata, never an immutable
completion claim. T04/T05 still own rendered evidence UX and live worker handoff.

```yaml
findings: []
```
