---
timestamp: 2026-11-10T22:50:56Z
decision: approved
---

# M58-T03 authority receipt and retained-editor correction

Independent source re-review preserves rejected CODE-v7. Reviewed the new
dialog-local SavedViewAccess, catalog integration, retained shared forms,
mutation-entry checks, recovery tests and named focusable body region. No
implementation edits, tests, services or competing browser runs were performed;
only this versioned record was written.

## Correctness and security

Refresh no longer resets a known org denial optimistically. Retry advances a
generation/epoch while keeping denied state until both fresh audience reads
succeed. Reads capture receipts before I/O, reject obsolete generation/epoch
responses and check abort before accepting. Known permission/authentication
failure invalidates old siblings and keeps remote actions blocked. Transient
failure or a pending retry does not become accepted authority. Naming drafts
remain mounted through recovery.

Current shared administration is tracked separately from org read access.
Explicit false hints or read-only shared rows revoke editing; a shared write
refusal also invalidates every administrative read already in flight. Positive
responses must come from a later-started current read before they can restore
editing. Retained Rename/Delete submit controls and mutation entry both check
this live state rather than the original row snapshot. Check editing access
performs a fresh bounded organization metadata read without discarding drafts.

Legacy shared-row editability can establish existing-row edit authority, while
shared creation still requires fresh explicit canCreateShared hints. Thus an
older server does not gain a new shared-create choice. Source Get refusal stays
local rather than falsely revoking all org metadata. The backend's independent
ownership/admin/source checks remain unchanged and authoritative.

## Coverage and architecture

The five reported original red cases now cover denial→failed/pending retry→fresh
success, both retained shared forms after capability loss and both forms after
write refusal. Reviewed tests preserve drafts, assert zero premature submission
and exercise explicit reauthorization. Additional tests reject an older positive
sibling after a current administrative false fact and preserve old-server edit
compatibility without inventing shared creation. Parent reports60 GUI cases
passing with97.84% branches/99.33% lines; these were not independently rerun.

The small access object remains scoped to one account/org/project/screen dialog
lifetime and reuses existing Query state and bounded catalog RPCs. It introduces
no global auth system, permission vocabulary, server behavior or dependency.
The existing scroll body now has a name, region role and keyboard focus target,
addressing the reported actual SavePending scrollable-region-focusable red
when its ordinary controls disable. No new layout or palette is inferred from
that semantic fix; rendered keyboard behavior still needs the final evidence.

Both CODE-v7 findings are resolved. No remaining reviewed source blocker
identified. Approval is limited to corrected source: actual app browser,
controlled faults, final55-preview matrices, legacy/full and publication gates
remain pending. Final rendered UX review is separate and no completion claim
is made here.

```yaml
findings: []
```
