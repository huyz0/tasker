---
id: ADR-0042
status: accepted
date: 2026-11-09
milestone: M54
---

# Evidence reuses authorized artifacts with explicit bounded reads

## Context

Artifacts already have folder/project ownership, stored content and task links.
Metadata lists omit bodies, but GetArtifactContent reads the whole body and task
links are unpaged. The digest has no artifact metadata. Artifact/link records do
not identify their author/linker; artifact creation time is not link time.
Literal editor text and base64 uploads share the same content column, and MIME
alone cannot distinguish their storage representation. Existing sizeBytes is a
legacy coarse stored-length value, not a reliable decoded or UTF-8 byte count.

## Options

1. Add another evidence store and mandatory completion validation. This duplicates
   artifact ownership and introduces enforcement outside this milestone.
2. Read all bodies/links and trim in MCP or the browser. This hides unbounded SQL,
   memory and wire costs; a digest would implicitly require artifact permission.
3. Reuse existing RPCs with optional bounded reads, paged link discovery and
   opt-in metadata. Persist only newly observed link provenance, leaving legacy
   authorship unknown. This preserves clients but needs explicit bound semantics.

## Decision

Choose option3. Each MCP tool invokes exactly one existing RPC through the
current loopback authentication/authorization path. New tools are list_folders,
list_artifacts, create_artifact, link_task_artifact, list_task_artifact_links and
get_artifact_content. No folder-creation MCP adapter is added; the existing
CreateFolder RPC remains agent-capable. Unlink remains human-only. Read tools
are read-only; create/link do not claim external execution or verified completion.

Tool arguments stay narrow: list_folders requires project_id; list_artifacts
requires folder_id; list_task_artifact_links requires task_id (the existing RPC
retains its artifact-axis selector). All three tools send an explicit bounded
page with default20/max100 and optional cursor, without automatic pagination.
create_artifact requires folder_id/name/content; content is an explicit string
and may be empty, while IDs/name remain nonempty. link_task_artifact requires
both IDs. get_artifact_content requires artifact_id and always supplies its
positive bounded limit. get_task_digest gains optional include_artifacts without
changing ordinary calls. Existing generic argument validation must retain every
other required-string boundary when empty artifact content is admitted.

### Compatible field map

These numbers are free in current c82fada main.tsp; recheck before generation.
No number is reserved merely by this document.

| Message | Additive optional field |
|---|---|
| GetArtifactContentRequest | maxCharacters field2, int32 |
| GetArtifactContentResponse | truncated field4, boolean; storedBytes field5, int64 |
| ListTaskArtifactLinksRequest | page field3, PageRequest |
| ListTaskArtifactLinksResponse | page field2, PageResponse; evidence field3, TaskArtifactEvidence[]; canLink4/canUnlink5 optional booleans |
| GetTaskDigestRequest | includeArtifacts field2, boolean |
| TaskDigest | artifacts field7, TaskArtifactEvidence[] |
| TaskArtifactLink | linkedAt field6, string; linkedBy field7, EvidenceActor |

New EvidenceActor fields1–3 are kind, id and name (strings). Kind is user or
agent, derived from authenticated principal; no request supplies it. New
TaskArtifactEvidence fields1–5 are link (TaskArtifactLink), availability
(string), contentType (optional string), storedBytes (optional int64) and
artifactCreatedAt (optional string). Availability is available, archived or unavailable;
unavailable entries carry no newly resolved artifact metadata. No body field.

Omitted read limits/page/digest opt-in preserve legacy behavior. Explicit false
is the same as omitted. Old TS/Go/JSON/protobuf clients must still decode the
existing fields, and ordinary tasks:read digests must issue no artifact query or
require artifacts:read. Generated outputs follow contract compilation.

### Body and create limits

MCP get_artifact_content always sends maxCharacters: default4000, allowed1–16000
integer Unicode code points. Zero, negative, fractional and oversized values are
InvalidArgument. The server enforces these bounds, not only the tool schema.
Omitted maxCharacters preserves the existing full-content RPC for old clients.

Read a stored UTF-8 binary prefix of at most4×(limit+1) bytes in SQL, never the
full content column followed by an application slice. SQLite casts to BLOB;
MySQL uses binary substring. This avoids SQLite text length/substr stopping at
embedded NUL. Decode the bounded prefix and return at most limit code points;
the extra bytes allow detection of another complete point without splitting a
returned point. Compute full storedBytes in SQL over binary/OCTET_LENGTH,
including NUL; truncated is true iff stored content extends past the returned
prefix. Test multibyte, NUL, empty, exact limit and partial UTF-8 boundary cases
on both dialects. Preserve legacy sizeBytes behavior on omitted-limit reads;
new clients use storedBytes for exact stored UTF-8 size, never decoded size.
On the new explicit bounded path only, legacy sizeBytes is the existing list
metadata SQL length(content) measure (SQLite text-character length, including
its NUL limitation; MySQL byte length). It is deliberately coarse and must not
be labeled exact bytes. Computing the old full-read UTF-16 length by loading
the body would defeat the bound; omitted-limit full reads remain unchanged.

Bun SQLite text binding consumes a leading BOM before storage. Create/update
artifact writes that start with U+FEFF use binary UTF-8 binding cast to text to
preserve the caller's literal; other writes and the MySQL path retain existing
binding behavior. Empty SQLite BLOB prefixes arrive as null and decode as empty.
These driver-specific boundaries require actual stored create/update/read proof.

Return the stored representation literally. No base64 decoding, decompression,
MIME inference, external URL fetch or automatic next-chunk loop. A prefix of
encoded content is not promised to be a decodable file. Existing full GUI reads
remain explicit user actions; the digest never reads bodies.

MCP create_artifact limits content to16000 UTF-16 code units, name256,
description1024 and MIME128 before RPC; describe that unit explicitly. The
existing RPC still enforces its15,000,000-unit content bound. No arbitrary
large-file upload is introduced through MCP and no new dependency is required.

### Paging and digest

MCP link discovery always sends a page: default20, maximum100. Existing unpaged
RPC clients retain their response. Exactly one taskId/artifactId selects the
current authorized organization using existing artifacts:read/artifact:read.
Apply a stable id-ascending keyset LIMIT before artifact/task name lookups;
lookups are limited to the selected rows and never select bodies. Paged responses
populate evidence field3 with bounded current availability/type/storedBytes/
creation-time and link provenance using the same metadata builder as the digest.
This is the GUI metadata source for every page, including pages beyond the
digest cap. Unavailable entries have generic artifactName in both paged links
and evidence, with no retained source metadata. Legacy unpaged responses do not
add evidence hydration. Bind cursors
to selector axis/id/org and effective ordering. Reject or restart mismatched/
malformed legacy cursors without reusing their position/count; count current
filtered rows rather than trusting a supplied count. No arbitrary sort surface.

includeArtifacts=true first passes normal task read, then artifacts:read and
artifact:read for that authorized org. Failure refuses the requested evidence;
it does not silently return an empty-success evidence list. Select at most21
links to determine a20-entry cap before metadata joins, omit bodies and OR the
cap into existing digest.truncated. Ordinary digest behavior remains unchanged.
Metadata validates current folder/project availability using existing policy.
Soft-deleted artifact/folder records remain readable as archived, with an
Archived label and authorized link, matching existing getArtifact/content reads.
A purged/missing source or archived project is unavailable with no newly
resolved name/size/type/time. Denied current authorization refuses the evidence
read without revealing source metadata. These rules do not alter omitted legacy
reads.
Existing same-org cross-project links remain valid; a link never grants access.

### Provenance and retry

Add nullable link timestamp and actor kind/id/name snapshots to both schemas via
additive migrations. New links capture current server time/principal inside the
write transaction; fields are never caller-selected. Retrying an existing pair
must retain original provenance. Legacy rows remain unknown, with no inferred
actor/time from assignment, task completion or artifact creation. Actor snapshots
remain meaningful after deletion; names are attributed as at-link snapshots.
A link is a reference to mutable current content, not an immutable completion
snapshot. Editing content does not change recorded link provenance.

Creation is not exactly-once. After an ambiguous create result, re-list the
folder/name and inspect the existing metadata instead of automatically creating
again. Sequential link repeats reuse the pair; concurrent repeats need an actual
both-dialect proof before stronger guarantees are documented. Do not invent an
MCP idempotency-key argument that the loopback caller cannot forward. Permission
failures are not retryable as network failures; read/paging retries retain scope.

### Current control permissions (T04 amendment)

The GUI has no authoritative effective-permission read. Reconstructing parent/
team/custom-role grants in a component would drift from policy; always showing
write controls causes avoidable read-only failures. Paged relationship reads
therefore add optional canLink field4/canUnlink field5, freshly verified free
against1fa68a7. They are advisory current control state, never write authority.
Human flags use the same artifact:write organization policy as link/unlink;
agent canLink reflects artifacts:write after current-org read authorization,
and canUnlink remains false. Existing writes still independently authorize.
Legacy unpaged reads retain their shape/cost. Missing flags mean unknown, not
false: show existing evidence without inventing permission or empty-success.

### Open-view reconciliation

Existing link/unlink writes emit no domain events; cross-project artifact events
may not match the selected task feed. The Evidence surface reuses the current
artifact section, scoped local mutation invalidation and applicable artifact
feed events, with15-second visible/open-pane metadata refresh plus explicit
Refresh/focus/reconnect. Refetch only the already-loaded page chain with fresh
cursors from page1, never automatically load more pages or read bodies. Preserve
loaded extent/dirty summary across transient errors. Stop polling on known
permission loss and require successful explicit Retry before cached metadata is
shown again. Account/task/scope changes obsolete the previous chain. No new event
family or claim of complete event coverage is introduced.

## Consequences

Workers can explicitly discover and attach stored outputs while people inspect
the same authorized objects. No new evidence authority, score, completion gate,
runner, attachment download or authorship inference is introduced. Bounds add
small contract/schema surface and a precise stored-byte measure. Link provenance
is recorded from deployment forward; historical provenance remains unavailable.
Roll back tool/UI exposure first and retain additive fields/data. Never drop
provenance columns or rewrite old records as a rollback step.
