# Addressable Screens — Shaping Notes

## Scope

Make a URL portable: it carries the scope it was taken in, reopens the same
thing for whoever pastes it, and a detail view shows where it sits. GUI and
specs only — no backend, contract or CLI change.

## The audit that produced this

Asked "does all screen bookmarkable and breadcrumable?". Measured rather than
recalled:

- **Bookmarkable: 3 of 15.** Only Tasks (`/tasks/:taskId`), Artifacts
  (`/artifacts/:artifactId`) and Memory (`/memory/:beliefId`) put what you
  are looking at in the URL. Twelve screens hold it in `useState` — Bin's
  tab, Organizations' section, Teams' and Roles' selection, Task Types'
  selection, and the inline-edit state in Agents, Projects and Labels.
- **Breadcrumbs: 2 of 15.** Tasks and Artifacts. Memory has a detail route
  and no path back.
- **Underneath both**: `activeOrgId`/`activeProjectId` live in a Zustand
  store that is neither persisted nor in the URL — `localStorage` is used for
  exactly one thing, the theme. So a bookmark records the screen but not the
  project, and the three deep-linkable routes resolve against whatever
  `orgs[0]`/`projects[0]` the switcher happens to auto-select. A task link
  saved from project A can open under project B.

## Three latent bugs found on the way

None of these is the missing feature; all three are live today and each gets
a regression test it currently lacks.

1. **`Artifacts` still uses the guard `Tasks` abandoned.** M23 found that a
   hard reload of a deep link lost it, because the scope-reset effect could
   not tell hydration (store `''` → real value, a tick after mount) from a
   real project switch. `Tasks` fixed it with a `previousScope` ref whose
   comment says `isFirstRender` "was not enough" — and `Artifacts` still uses
   `isFirstRender`, with no hydrate-from-empty test.
2. **Memory never reconciles a belief's scope with the active scope.** A
   `/memory/:beliefId` for a belief in another project renders `BeliefDetail`
   with the *active* org id, because the belief resolves through a direct
   by-id query that bypasses the scope entirely.
3. **Memory mirrors its route param into `useState`** and writes it with
   `replace: true`. Two consequences: Back never steps through visited
   beliefs, and the duplicated state can diverge from the URL.

## Decisions

- **Query parameters, not path segments** — ADR-0025 records the measured
  cost. The decisive fact: `AppShell` sits *above* the inner `<Routes>`, so
  it cannot call `useParams`, and it is exactly where the single app-wide
  `useLiveEvents({ orgId, projectId })` subscription lives. Path scope would
  force converting a descendant router into a nested layout route, which
  silently turns twenty absolute paths relative and breaks the nav's
  `startsWith` active check with no error.
- **The URL is the source of truth; the store stays the read surface.**
  Twenty component sites read scope, in ~120 places. Rewriting them to read
  `useSearchParams` would change every query key in the application for no
  user-visible gain. One sync point instead, and the readers do not move —
  which also preserves the M23 guard by construction, since the store still
  starts empty and fills a tick later.
- **Navigational state goes in the URL; transient editing state does not.**
  "Which thing am I looking at" is addressable. An open inline-edit form is
  not: each is paired with unsaved draft text the URL would not carry, so
  restoring the id without the draft is worse than not restoring it.
- **The shared test helper lands first.** Nineteen test files mock the layout
  store and nine render with no router at all; there is no shared render
  helper. Without one, every later task multiplies across ~30 bespoke setups.
- **Named rather than half-done**: Teams and Roles keep local selection,
  because both find the selected row inside the loaded page — a deep link
  past page one would resolve to nothing, and fixing that needs `getTeam` /
  `getRole` by-id RPCs. Artifacts' folder selection stays local because it is
  *derived* from the artifact on a deep link, so URL-ifying it means a
  write-back on resolve; its folder crumbs stay unlinked labels until then.

## Context

- **Visuals:** none — no new screens; breadcrumbs use the existing component.
- **Milestone:** `.milestones/MILESTONE-28-addressable-screens/`
- **ADR:** ADR-0025 (scope in the URL as query parameters)
