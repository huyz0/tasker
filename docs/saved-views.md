# Tasks and Reports views

Tasks keeps its layout, search, priority/readiness filters and sort in the URL.
Reports keeps its 7/30/90-day window in the URL. Reload and browser Back/Forward
restore those supported settings and the organization/project context. A person
opening a shared URL needs their own current access to its resources.

Use **Saved views** on either screen to give a reusable query a name. Saved
views contain supported settings and a project reference. They store no task
results, report snapshots, credentials or access grants.

## Save and reopen

1. Select the project and adjust Tasks or Reports.
2. Open **Saved views**, then choose **Save current view**.
3. Enter a name. **Personal** is the default; only you can discover and open it,
   including when another person is an administrator.
4. If current policy permits it, choose **Organization** to share the definition.
   Organization administrators manage shared definitions.
5. Save, then choose **Open** to apply it. Opening uses a fresh authorized read
   and updates the URL's project and supported settings together.

Opening the catalog does not apply a view. Personal and Organization have
separate name filters and 20-item pages. Previous/Next reaches every matching
entry without loading the entire catalog. Tasks and Reports have separate
catalogs; the project label identifies each definition's context.

If you change the URL while naming a view, the form asks you to use the current
settings explicitly and retains the name. **Rename** changes only the name.
Use **Save current view** for a new definition with new settings. **Delete**
removes the named definition after confirmation and leaves its source data and
the current screen intact.

## Shared access and recovery

Opening an Organization view requires current organization and source access.
Creating, renaming or deleting shared definitions requires the existing
organization administration permission. A creator does not retain those rights
after demotion. Each mutation rechecks policy on the server. Personal
definitions remain creator-only.

An access change can disable an open shared editor while keeping its draft.
**Check editing access** obtains fresh metadata. A pending or failed retry does
not restore editing. Lost catalog access hides the lists and offers an explicit
refresh. A source-specific Open refusal stays with that definition.

An archived/deleted or inaccessible project can make a definition unavailable.
Open then reports the problem and preserves the current URL. An authorized
owner or administrator can still rename/delete obsolete configuration. Restore
source access/project availability or save a new definition using an accessible
project. Malformed or unsupported definitions similarly need replacement or
cleanup; the application does not substitute another project or query.

A late Open response cannot override a later account, scope or browser-history
choice. Closing a pending save does not cancel a server write that already
committed; reopen to obtain current metadata. Closing restores focus to the
launcher. The content supports native keyboard scrolling on narrow screens,
including while pending form controls are disabled.

The URL remains the current screen's state. Saved definitions apply only when
you choose Open. An older server that omits the optional shared-create capability
still supports Personal saves; its omission cannot establish permission to
offer a new Organization save.
