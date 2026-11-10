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
