# M54 completion evidence interaction

Keep the existing task workspace, system sans/monospace roles, violet interaction
and semantic ink/surfaces verified in M51/M53. Add no primary navigation item.
Evidence belongs beside the written summary and existing repository/build signals.
Rename/evolve the existing task Artifacts section and controls into this single
Evidence surface; do not add a duplicate list/linker.

## Evidence section

Use an Evidence heading with a short explanation: linked artifacts are reported
outputs, while repository/build state is observed from its provider. Do not call
an agent-linked artifact verified, successful or proof of execution. Show artifact
name, type and exact Stored bytes when available; creation time is labeled Created,
not Completed or Linked. Show Linked by and Linked at only from recorded link
provenance. Identify agent/user source explicitly; legacy data says Link author
not recorded / Link time not recorded. Never substitute current assignee or guess
content authorship. Actor names are historical link snapshots, not current roles.
Links reference mutable artifacts. Explain that the view shows current stored
content, not an immutable version captured at link/completion time. A subsequent
artifact edit changes what is reviewed without rewriting link provenance.

Use the paged link response's evidence metadata for every page, including pages
beyond the digest's20-entry cap. Never fetch a body to discover metadata.
Use bounded metadata pages, default20, with Load more and a stable count when
available. A page failure retains loaded rows and exposes Retry for that page.
Changing task/account/scope clears obsolete pages; late results cannot replace
current task evidence. A metadata refresh must not erase a summary draft.

An accessible artifact-name link uses canonical authorized resource scope from
M53; a same-org artifact from another project can open under its real project.
Opening a body is an explicit action in the artifact viewer, not a prefetch while
rendering task evidence. Return/Back retain the task origin and summary intent.
Soft-deleted artifacts/folders show Archived with their still-authorized link,
matching existing artifact-reader policy. Purged sources and archived projects
show Artifact unavailable. Current denied resources expose no cached title,
size, owner or body disclosure after known access loss. A failed read is an error
with Retry, distinct from a legitimately empty evidence list.

## States and controls

Loading has a compact named status/skeleton. Empty says No evidence linked and
explains how existing artifacts can be linked when allowed. Read-only users get
an honest view without disabled off-screen editing controls. Denied evidence
reads explain insufficient access without claiming no evidence exists. Linking
progress, success and failure use existing status/ink roles and preserve selected
artifact on recoverable failure. Unlink remains the existing human-only action;
no MCP unlink tool or destructive bulk action is introduced.

At375px, wrap names and provenance, keep actions reachable and avoid page-wide
horizontal scrolling. Preserve heading order under the task dialog title, visible
focus, native controls and current summary disclosure semantics. Status changes
announce meaningful outcomes without moving focus. Tab/Enter activation and
Back/Forward must work with portals and both themes. Dense metadata uses existing
type-caption roles; do not shrink text to make the layout fit.

## MCP handoff

The worker discovers folders, lists artifact metadata, creates bounded stored
content, links it to a task, requests an opt-in evidence digest and explicitly
reads a bounded prefix. Each action is one RPC. The model sees stored content,
contentType, truncated and precise storedBytes, not a guessed decoded document.
No implicit fetch-all, auto-followed external URL, enforced completion or new
runner is implied. Ambiguous create results require discovery before another
create. Show human review as a separate decision using existing task controls.

## Required previews and browser proof

Render empty/loading/error/denied, populated mixed user/agent/legacy provenance,
unavailable source, multiple pages/page retry, long names and large/encoded
content metadata. Run both themes at375/1280 including portal contents, keyboard
focus and full-page overflow. Actual worker-to-human proof must use a live scoped
token, explicit body read, cross-tenant refusal and an ordinary tasks-only digest.

## Freshness and access lifetime

Existing link/unlink RPCs do not emit domain events; cross-project artifacts may
not appear in the selected task's project feed. Do not assume that feed covers
every evidence change. Use existing scoped local mutation invalidation and
artifact events where applicable, plus a15-second visible/open-pane metadata
refresh and Refresh action. Focus/reconnect refresh source truth. No body is
polled, no new page is automatically loaded and no new event family is required.

Refresh the already-loaded bounded page chain sequentially from the first page
using fresh cursors, deduplicate stable link IDs and retain prior rows while a
transient read fails, clearly marking stale/error with Retry. Do not erase the
user's loaded extent or summary draft. Poll only the current task/account scope
while the pane/document is visible; pause on hidden/closed/unmounted views.

A known permission loss hides all earlier accepted metadata and stops automatic
refresh until explicit successful Retry reauthorizes it. A denied or unavailable
source cannot regain a cached title through late events, stale pages or old
responses. Sanitize TaskArtifactLink.artifactName inside unavailable entries too.
New worker links/unlinks and edits/archive/purge of a cross-project source must
converge in the open view by the next successful bounded refresh.
