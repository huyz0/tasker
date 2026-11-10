---
status: active
title: URL and named operational views
milestone: M58
created_at: 2026-11-10
---

# M58 executable acceptance plan

## TC-001 — URL entry and history (T01/T04, exit1)

Given a task URL with supported view/text/priority/ready/sort settings or a report
URL with a supported window, when entering or reloading, then controls, outgoing
requests and displayed state reproduce it. Given explicit changes and browser
Back/Forward, then the corresponding supported state returns. Text typing
replaces one entry rather than adding one per keystroke. Cached/local defaults
never override a current URL. Reports exceptions/trends/spend use the same window.

## TC-002 — Narrow writes and source navigation (T01/T04, exits1/3)

Given current org/project and unrelated query parameters, when changing/resetting
view settings, then those values survive and only owned supported fields change.
Given a filtered task list, when opening/closing a task, then its list settings
survive. Given a report-to-task link and Back, then the report window returns;
cross-screen links do not carry another screen's filters. No results, pagination
cursors, dialogs, unsaved form content or bulk selections are serialized.

## TC-003 — Malformed link recovery (T01/T04, exits1/4)

Given unsupported modes/sorts/windows, invalid priorities/booleans, duplicate
owned keys or an overlong text filter, when loading, then invalid fields use
safe defaults, valid fields remain and a clear Reset view action is available.
Given Reset, then only the screen's view settings clear. A malformed URL never
becomes arbitrary SQL, an access grant, or a fabricated empty data result.

## TC-004 — Scope and stale writers (T01/T04, exits1/3/4)

Given an authorized entity deep link requiring scope normalization, then its
valid scalar view settings survive. Given explicit org/project selection,
then incompatible detail and bulk selection clear, and invalid resource
references never carry into the new scope. Given a late view callback after
navigation to another screen, then it cannot resurrect the previous screen or
scope. Sorting, filtering and mode/history changes discard transient selection.
Run actual both-theme keyboard/mobile journeys and restored behavioral faults.

## TC-005 — Definition ownership and authority (T02/T04, exits2/3)

Given two humans in one org and a human in another, then personal definitions
are creator-only even under ID guessing. Shared create/edit/delete requires the
explicit existing admin permission. Submitted owner/org values never replace
credential/resource-derived authority. Store allowed query definitions only,
not SQL, result rows or grants. Current access and referenced resources are
validated on save/load/use, on both SQL dialects and through real wire clients.

## TC-006 — Explicit application and recovery (T03/T04, exits3/4)

Given a saved definition list arriving after current navigation/typing, then it
does not rewrite the current URL. Given an explicit Open, then a validated whole
query updates the URL intentionally. Given rename/delete/cancel/dirty naming,
loading/error/denial or deleted/obsolete resources, then copy, action availability
and recovery are truthful. A failed/late response cannot overwrite current user
intent. Personal/shared ownership and editable state remain distinguishable.

## TC-007 — End-to-end and publication (T04, exits1–4)

Given real users, definitions and current resources, run private/shared/cross-org
wire/browser cases, revoke access/delete references, and exercise reload and
Back/Forward. Both-dialect migration/legacy, generated client, full local,
rendered accessibility/overflow and independent review checks must pass. Publish
only after actual final-head CI; retain source/commands/results as evidence.

## TC-005a — Personal and shared authority

Given two people in one org, an administrator and another org, when creating a
personal view with a forged owner/org property, then stored identity comes only
from current credentials and the authorized project's org. Given another
person's private ID, even for an admin, Get/Rename/Delete return NotFound and
List/count omit it. Given a shared definition, only current org:admin may
Create/Rename/Delete; membership without admin cannot edit it, including its
former-admin creator after revocation. Agent credentials never become owners.

## TC-005b — Allowed definitions and current references

Given version1 Tasks/Reports controls, including priority0 and explicit false/
default values, then canonical definitions round-trip through real generated
codecs. Given unknown/contradictory/oversized/control-character or SQL/results/
cursor fields, then validation refuses them before storage/use. Given a foreign,
missing or archived project, then Create/Get cannot confer access. Given a
previously saved entry whose project is removed or definition becomes invalid,
then metadata identifies recovery while Get returns no query and the current
screen remains unchanged. Revoked source-read rights are checked afresh.

## TC-005c — Bounded lists, names and lifecycle

Given more than100 accessible and inaccessible entries with mixed owners,
visibility and screens, when listing/filtering/paging, then authorized SQL
predicates apply before limit/count, pages stay bounded and scoped cursors do
not replay another rowset. Given duplicate or concurrent normalized names,
then each audience namespace rejects its own collision with AlreadyExists;
other personal creators can use the same name. Given obsolete references,
then authorized Rename/Delete can clean up metadata without reading old query
contents. Given organization purge, then its definitions disappear atomically;
project removal retains a discoverable unavailable entry. Given mutations,
then private names/query contents never enter organization event payloads.

## TC-005d — Dialects, migrations and clients

Given populated pre-view SQLite/MySQL databases, when applying the additive
migration and rebooting twice, then existing work and new definitions persist
without duplicates or data loss. Given native MySQL concurrent name writes,
then uniqueness holds and errors remain typed. Given the old SDK, then existing
messages/fields/methods and actual decodes remain compatible. Restored owner,
admin and reference-validation faults must make their refusal tests fail; full
checks and current final-head CI are required before publication.

## TC-006a — Large named catalogs and metadata privacy

Given more than100 personal and organization entries, including a desired entry
beyond the first page, when opening each section and using Previous/Next/name
filter, then its own bounded page/count/history and target remain reachable
without fetch-all or falsely empty sections. Given page loading/error/Retry
while a Save/Rename draft exists, then controls and draft remain usable and no
row is silently applied. Given org:read without project:read, then catalog/Get
metadata does not expose that project's current display name; generic context
remains usable and fresh Open still earns its independent source permission.

## TC-006b — Empty-catalog authority and delayed intent

Given an empty catalog for a current org admin/member/viewer, when opening Save,
then only a fresh explicit server current-admin hint offers Organization; an
absent hint, failure, account/scope change or revoked authority cannot reuse
an older shared-create choice. Given a delayed fresh Open, when account/org/
project/URL search/navigation or dialog lifetime changes, then its eventual
response cannot overwrite the current screen. Given an unchanged explicit Open,
then all supported settings and the authorized project apply together in one
history step, with Back/Forward restoring the previous scope and settings.

## TC-006c — Sibling denial and truthful recovery

Given one audience catalog returns an organization permission denial while a
sibling response or explicit Open is delayed, then neither later result exposes
names or applies settings. Remote writes stay blocked and local naming drafts
remain recoverable through explicit fresh-list retry. Given an independent
source-read refusal, then current settings remain and other org metadata is not
falsely revoked. Given session verification failure, then Retry session checks
again rather than claiming sign-out. Given an empty page with positive count or
absent PageResponse, then Previous/Refresh is offered without claiming a zero
collection; a present zero count retains truthful unfiltered/filtered emptiness.
