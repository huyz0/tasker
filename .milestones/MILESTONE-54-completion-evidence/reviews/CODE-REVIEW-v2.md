---
timestamp: 2026-11-09T20:52:18Z
decision: approved
---

# M54-T02 corrected source and boundary proofs

Independent agent/reliability reviewers approve the corrected source. Rejected
v1 remains recorded. This review approves source and observed focused/SQL/wire
proofs; final full35 checks still gate task completion.

Correctness: every new MCP adapter invokes exactly one existing RPC. Discovery
and link tools send bounded pages; content reads send an explicit positive code-
point limit. Explicit empty create content is valid while IDs/names and other
required strings remain nonempty. Optional null arguments are rejected according
to their published types, with three observed zero-RPC regressions. Folder RPC
permissions remain unchanged and no folder/unlink adapter is added.

The SQL binary prefix is at most4×(limit+1) bytes before decoding/slicing, with
exact stored UTF-8 byte metadata and explicit truncation. Unicode, NUL, BOM,
empty, exact/overflow limits and literal encoded representations are covered.
BOM decoding preserves the stored point. Actual SQLite probes found that native
text binding consumes an initial BOM and zero-length BLOBs return null; binary
binding only for leading-BOM create/update writes and empty-prefix normalization
preserve literal behavior. Duplicate-name detection now selects only an ID.
Legacy omitted-limit reads retain their coarse size/full-content behavior.

Coverage:138 focused existing/new artifact/link/MCP cases pass; backend TSC is
green. The final owned-schema run passes three SQLite/MySQL content and legacy
upgrade/reopen cases with68 assertions. Existing links/content survive and no
historical provenance is invented on repeat. Six restored faults fail: full
prefix under alias, uncapped source rows, metadata body alias, dropped BOM,
optional null and foreign cursor position. Tests inspect raw DB results before
response shaping, not merely the returned prefix or list length.

Compatibility:442 legacy TS message descriptors/1241 existing fields remain
unchanged. Four old TS protobuf decodes plus four old Go JSON and four protobuf
decodes accept the additions and retain old values. Current TS/Go are generated
from the additive checked-in proto; prior optional and streaming declarations
remain intact. Real HTTP worker-to-human handoff remains a T05 requirement.

Architecture: current artifact ownership/storage and generated RPC contracts
remain the boundary. Source links are capped before bounded metadata lookups;
current org/archive policy controls metadata and unavailable nested names are
sanitized. Cursor position is bound to endpoint/axis/owner/org/order and counts
are recomputed. Nullable actor/time migrations preserve old records; principal
snapshots and insert execute in the existing unit-of-work boundary. Sequential
repeat retains original provenance; concurrent pair deduplication is not promised.
No digest opt-in or Evidence UI is claimed implemented in this task.

Security: no caller-supplied actor/time is trusted, no link grants source access,
missing scope/cross-org readers are refused, and metadata never transfers stored
bodies. Snapshot names identify historical linkers, not content authors or current
roles. Tests create/drop their own random schemas and restore environment state;
private runner credentials remain in memory and are not logged. Both actual
schemas and generated clients are exercised; no new dependency or permission
flow is introduced.

```yaml
findings: []
```
