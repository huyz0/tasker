# M54 executable acceptance plan

Static design is T01. Each scenario requires executable observed red/green proof
in its implementing task; no scenario is passed by existing file presence.

## TC-001 — Thin authorized discovery (T02/T05, exit1)

Given an actual scoped token and folders/artifacts in its org, when each advertised
MCP discovery/create/link/read tool is called through JSON-RPC and loopback,
then it invokes exactly one existing RPC. Given missing scope, cross-org IDs,
both/neither link selectors or invalid input bounds, when called, then it fails
before unauthorized data/write and invalid tool args invoke zero RPCs. Given
unlink/folder creation, then neither has a new MCP adapter, existing CreateFolder
remains agent-capable over RPC and unlink remains human-only.

## TC-002 — Stored prefix and server bounds (T02/T05, exits1/4)

Given literal text, MIME-identical encoded text, Unicode/non-BMP, embedded NUL,
empty and oversized stored bodies on SQLite/MySQL, when explicit limits1/4000/
16000 are read, then only a bounded binary SQL prefix is selected, returned
code points fit the limit, storedBytes is exact and truncated is truthful.
Given a split UTF-8 boundary, then no returned point is split or replaced by a
prefix-decoding artifact. Given omitted limit, then old-client full reads retain
behavior. Given0/negative/fractional/16001, then the RPC rejects independently
of MCP validation. The new bounded response retains coarse SQL-length sizeBytes,
uses storedBytes for exact portable size and never loads full content to compute
UTF-16 length. No decode/decompress/external fetch occurs.

## TC-003 — Link page before lookup (T02/T05, exits1/4)

Given over100 links and large artifact bodies, when20 rows are requested, then
SQL limits source links before bounded name/actor metadata lookups and selects
no content. Every requested page carries bounded evidence metadata, including
exact storedBytes/current availability beyond the digest's20-entry cap. Given later-page failures, then the same page retries without losing
prior rows. Given another task/artifact/axis/org/order cursor, then its position/
count is not reused. Given omitted page, then legacy reads keep existing shape.
Test stable tie-free id ordering, empty/end pages and current filtered counts.

## TC-004 — Optional metadata digest (T03/T05, exits2/4)

Given a tasks-only token, when includeArtifacts is omitted/false, then its old
digest succeeds without artifact queries or scope. Given true and no artifact
permission, then the request is refused. Given true with permission and21+links,
then at most20 metadata entries are returned after a21-row SQL cap, bodies are
never selected and digest.truncated combines evidence and existing caps. Given
purged/missing sources or archived projects, then generic unavailable entries
leak no source metadata. Given archived artifacts/folders with read permission,
then metadata remains readable with Archived availability, matching legacy
read policy. Given denied authorization, then no source metadata is exposed.

## TC-005 — Honest forward provenance (T02/T04/T05, exits3/4)

Given new user/agent links, when inserted, then server time and authenticated
actor snapshots are persisted atomically on both dialects and caller-supplied
actor fields cannot control them. Given a sequential repeat, then original link
identity/provenance remains. Given legacy data or deleted actors, then the UI
shows unknown/historical link provenance without fabricating authorship or time.
Concurrency behavior is measured and never described as exactly-once by default.

## TC-006 — Human review and recovery (T04/T05, exits3/4)

Given mixed evidence/provider signals, when a person reviews a task, then the
surface distinguishes reported output and provider observation, labels link vs
creation time, and uses current authorized canonical artifact links. Given
empty/loading/denied/error/unavailable/page-failure states, then messages and
Retry are distinct. Given scope/task/account changes or known access loss, then
obsolete metadata is hidden and late responses cannot replace current evidence.
Given a dirty summary, when evidence refreshes or navigation returns, then its
writing remains protected by the existing intent policy.

## TC-007 — Layout and keyboard (T04/T05, exit3)

Given long names and all states in both themes at375/1280, when rendered with
actual providers and portals, then completed-story accessibility, contrast,
heading and overflow checks pass. Given Tab/Enter and Back/Forward/reload, then
evidence actions and canonical context remain usable without focus jumps or
unreachable horizontal controls. Capture populated and failed mobile states.

## TC-008 — Compatibility and live handoff (T05, exit4)

Given old generated TS/Go and fresh JSON/protobuf clients, when optional fields
are absent/present, then old digest/content/link behavior and field numbers remain
compatible. Given a live worker token, when discover→create→link→opt-in digest→
explicit bounded body read runs, then a person sees the same output/provenance;
read-only/cross-tenant refusal leaves data unchanged. Given an ambiguous create
response, then documented discovery precedes another create. Revoke temporary
credentials finally without printing or persisting them. Run both dialects,
full35 gates, affected browser suites and standalone smoke before publication.

## TC-009 — Open-view freshness and mutable references (T04/T05, exits3/4)

Given a task already open with multiple evidence pages and a dirty summary, when
a worker links/unlinks output or edits/archives/purges an artifact in another
project, then applicable invalidation or the next successful15-second visible
metadata refresh reconciles the existing loaded chain without body reads,
auto-loading more pages or losing writing/loaded extent. Given a hidden/closed
pane, then polling pauses and focus/reopen refreshes current metadata. Given a
failed refresh, then prior rows are marked stale with Retry. Given known access
loss, then rows/nested names are hidden and polling stops until successful
explicit reauthorization; late old results cannot revive them. Given a link then
artifact edit then human review, then current content/Stored bytes are shown
without claiming an immutable linked version or changing link provenance.

## TC-010 — Authoritative current controls (T04/T05, exit3)

Given an authorized paged reader, when current effective artifact-write policy
is false, then canLink/canUnlink are false for human controls; a write-capable
agent can link but cannot unlink. Given missing capability fields, then existing
links remain visible with unavailable controls rather than an invented permission
or empty state. Current server writes independently enforce policy even if a
previous response allowed the action. Legacy unpaged reads retain shape/cost.
