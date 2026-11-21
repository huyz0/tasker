---
timestamp: 2026-11-10T22:36:42Z
decision: rejected
---

# M58-T03 saved-view controls four-lens source review

Independent source review covers SavedViews/definition, Tasks/Reports wiring,
the optional server administration hint, additive contract/generated changes,
native tests and serialized preview fixtures against ADR0044, named UX and
TC006a–c. Frontend/security standards and the review protocol apply. Existing
versions remain preserved. Only this review record was written; no production
source, tests, services or competing browser suites were changed or run.

## Correctness and architecture

The compact explicit-entry dialog fits the approved screen hierarchy. Personal
and Organization catalogs have independent bounded20-row cursors/filter/page
state and useful retry/count distinctions. Source settings are captured from
the applied URL, not results. Fresh Get validates returned identity/audience/
screen and supported query before one navigation; live URL/history-key/account/
scope/dialog guards prevent stale application after departure or new intent.
Applying also clears task bulk selection explicitly, including a same-query
Open. Personal default, Save-as-new, Rename name-only and named permanent Delete
remain coherent with the backend contract.

The optional canCreateShared field comes from actual server org:admin policy,
including empty catalogs. Missing/false hints conservatively omit the shared
choice; no literal role or per-row edit flag is promoted into creation authority.
Backend mutations still earn their own policy. The field is additive and staged
GUI exceptions are removed because real controls now consume all five methods.
The source-specific Get refusal stays distinct from catalog org-read loss.

Two UI authority-lifetime gaps block source approval:

1. A confirmed catalog denial disables a retained editor, but Refresh lists
   increments revision and immediately initializes denied:false. With new reads
   pending or Unavailable, personal Save/Rename/Delete can become enabled and
   sameSession accepts them before any fresh post-denial org read succeeds.
   Starting a retry is not reauthorization. Preserve revoked/unchecked state
   through pending, unavailable and canceled reads; accept only actual fresh
   current-generation success. Keep the local naming draft recoverable.
2. A retained shared Rename/Delete form uses its original row snapshot. Fresh
   catalog canEdit:false removes row actions but does not disable that form.
   Likewise authorityDenied affects new shared Save only, leaving the retained
   shared edit/delete retry enabled after PermissionDenied. Current readable
   org metadata is not current shared-write authority. Preserve the name/context
   while requiring fresh current shared editability before another write.

## Security

The server's ownership/admin/source checks remain correct; neither finding is a
backend authorization bypass. The defects revive misleading remote actions
after known authority loss. Existing account-scoped query identities, returned
row scope validation, no private payload broadcast and fresh source Get are
appropriate. Dialog lifetime and pending controls defend old completion
callbacks, but they do not replace the missing acceptance state above.

## Coverage

The reported53 focused cases cover bounded audience navigation beyond100,
privacy/defaults, fresh Open/history, account/scope/dialog departure, ordinary
denial, duplicate/name recovery, session failure and a late sibling response.
The existing denial recovery test goes directly to successful lists; it does
not cover denied→Refresh→pending/Unavailable/cancellation before success.
Add that sequence with a retained editor and zero write requests, then verify
fresh successful recovery. Add retained shared Rename and Delete after fresh
canEdit:false and after shared-write refusal, preserving local drafts and
requiring a new authorized capability before submit.

Serialized fixture responses exercise the real client and local preview state
is restored. Reported native contrast/long-name reds and fixes are meaningful,
but final screenshots are not yet available for this source pass. Reported
SQLite/MySQL/socket/capability tests and types support the additive server hint;
they were not rerun. Same-query screen regression,55-preview matrix, actual app
browser/fault/legacy/full and final-head gates remain pending. This is not
rendered UX or task completion approval.

```yaml
findings:
  - file: apps/gui/src/components/SavedViews/SavedViews.tsx
    line: 106
    severity: Medium
    comment: >-
      Refresh after a known catalog PermissionDenied resets the access fence to
      denied:false at the new revision before a successful read. A retained
      personal/rename/delete editor can submit while fresh lists are pending
      or Unavailable. Retain revoked/unchecked state until an actual accepted
      fresh response; test pending/failure/cancellation then successful recovery
      with draft preservation and zero premature remote writes.
  - file: apps/gui/src/components/SavedViews/SavedViews.tsx
    line: 140
    severity: Medium
    comment: >-
      The retained shared Rename/Delete form submits from its old row snapshot
      even after fresh catalog canEdit:false or shared-write PermissionDenied.
      authorityDenied only gates new Organization saves. Disable retained
      shared mutation actions while preserving the local draft, and require
      fresh current shared editability before re-enabling them. The server
      already enforces this policy; do not broaden permission.
```
