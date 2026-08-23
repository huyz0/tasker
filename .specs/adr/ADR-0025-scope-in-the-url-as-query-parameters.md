---
id: ADR-0025
status: accepted
date: 2026-08-23
milestone: M28
---

# The active org and project live in the URL as query parameters, synced into the existing store

## Context

`activeOrgId` and `activeProjectId` live in a Zustand store
(`store/layout.ts`) that is neither persisted nor reflected in the URL — only
the theme touches `localStorage`. So bookmarking `/tasks` or `/reports` does
not capture *which project*, and on reload `OrgProjectSwitcher` auto-selects
`orgs[0]`/`projects[0]`. Even the three genuinely deep-linkable routes
(`/tasks/:taskId`, `/artifacts/:artifactId`, `/memory/:beliefId`) therefore
resolve against a scope the URL never described: a saved task link can open
under a different project than the one it was saved from.

Twenty component sites read that scope, in four shapes — query keys with an
`enabled:` guard, "select a project" guard clauses, props passed to children,
and effects that fire *on scope change*. That last shape is where the risk
concentrates: `Tasks/index.tsx`'s `previousScope` ref exists because M23
found that a hard reload of a task URL lost the deep link, and the
discriminator it uses is that the previous project was the empty string.

## Options

**A. Path segments — `/o/:orgId/p/:projectId/tasks`.** Canonical,
hierarchical, and the natural source for a breadcrumb trail. Rejected on
measured cost, not taste:

- `AppShell` sits *above* the inner `<Routes>` (`App.tsx`: a descendant
  `<Routes>` inside `AppShell`'s `children`, not an `<Outlet/>` layout). It
  cannot call `useParams`, and it is where the single app-wide
  `useLiveEvents({ orgId, projectId })` subscription lives. Path scope forces
  converting the descendant router into a nested layout route first.
- That conversion silently turns all twenty absolute paths into relative
  ones — a runtime failure, not a compile error.
- `AppShell`'s active-nav check is
  `pathname === item.path || pathname.startsWith(item.path)`. Under any path
  prefix every nav item goes inactive, with no error.
- Three scope shapes do not fit one hierarchy: project-scoped screens,
  org-scoped screens (Teams, Roles, Labels, Task Types), and unscoped ones
  (Settings).
- Every e2e spec navigates to bare paths, so all of them would need a
  bare-path → scoped-path redirect tier to keep working.

**B. Query parameters — `/tasks?org=…&project=…`.** Less pretty, and
uniform across all three scope shapes. `useSearchParams` works anywhere
inside the Router, including `AppShell`. No route restructuring, so paths
stay absolute, the active-nav check keeps working, and a bare `/tasks` stays
valid — it simply means "no scope chosen yet", which is what the switcher's
auto-select already handles.

**C. Persist the store to `localStorage` instead.** Cheapest of all, and it
solves the wrong problem: it makes scope survive *your own* reload while
leaving a shared link still resolving against the recipient's last-used
project. A bookmark that means something different to each person is not a
bookmark.

## Decision

Take **B**. Scope is carried as `?org=…&project=…`, and the URL is the
source of truth.

**The store stays as the read surface.** One synchronisation point writes the
URL into the store; the twenty reading sites are untouched. Replacing them
with `useSearchParams` at each call site would change every query key in the
application for no user-visible gain, and would be a far larger diff than the
behaviour warrants.

Direction of flow: URL → store on navigation; the switcher and any other
scope corrector writes the **URL**, which flows back into the store. The
switcher's auto-select writes with `replace: true`, so the scopeless URL is
not left in history.

This also preserves the M23 guard by construction. The store still starts
empty and is filled a tick later, so `previousScope`'s "previous project was
empty means hydration, not navigation" discriminator keeps working unchanged.
Path scope would have killed it — the URL guarantees a non-empty scope from
the first render, so that arm would go dead and the stale-detail behaviour
would have to be re-expressed as a link-construction rule.

## Consequences

Easier: a link is now portable — it carries the scope it was taken in, so it
resolves the same way for whoever opens it. Breadcrumbs gain a real hierarchy
to render. `AppShell` keeps its single event subscription with a one-line
change. Every existing e2e spec keeps working against bare paths.

Harder: every in-app link must preserve the current scope, or following one
silently drops it. That is a real ongoing cost and the reason a `useScopedTo`
helper exists rather than each call site concatenating strings.

Ugliness accepted: `?org=org_123&project=proj_456` is noisier than a path.
Judged worth it — the alternative's cost is a router restructuring whose
failure modes are silent.

Foreclosed for now: human-readable scope in the URL (slugs rather than ids),
which would need a slug column and a resolver; and a scope-aware Global
Search, whose results are org-scoped and may name entities in another
project — the backend does not return a project id per result, so that needs
a contract change and is out of scope here.
