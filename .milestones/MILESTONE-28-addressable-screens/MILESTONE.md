---
id: M28
title: Addressable Screens
status: in-progress
goal: A URL copied out of the browser reopens the same thing for whoever pastes it — carrying its own scope — and every deep-linkable detail view shows a path back to its parent.
depends_on: []
surfaces: [gui, specs]
exit_criteria_met: false
started_at: 2026-08-23
completed_at: null
---

# M28 — Addressable Screens

## 1. Goal

Three of fifteen screens put what you are looking at into the URL. The other
twelve keep it in `useState`, so a reload loses it. Underneath all of them,
`activeOrgId`/`activeProjectId` live in a store that is neither persisted nor
in the URL — so bookmarking `/tasks` does not record *which project*, and
even the three deep-linkable routes resolve against a scope the URL never
described. A task link saved from project A can open under project B.

Breadcrumbs are mounted on two screens. Memory has a detail route and no path
back at all.

After this milestone a URL is portable: it carries its scope, it reopens the
same thing for whoever pastes it, and a detail view says where it sits.

## 2. Why Now

Asked directly ("does all screen bookmarkable and breadcrumable?") — the
answer was no on both counts, and the audit that produced it found three
latent bugs alongside the missing feature (below). Every numbered milestone
through M27 is closed, so nothing is blocked behind this.

It also finishes something M27 started. That milestone corrected
`NAVIGATION.md` and filed "breadcrumbs on detail views" under **Enforced
today** on the strength of two screens mounting the component. Memory is a
counterexample — a deep-linkable detail view with no crumbs — so the rule as
filed overstates. This milestone makes the rule true rather than re-wording
it.

## 3. Exit Criteria

- [ ] A URL copied from any scoped screen and opened in a fresh session
      (different last-used project, cold load) shows the same scope and the
      same content — proven by a Playwright test that reads a URL from one
      context and opens it in another.
- [ ] Bin's tab, Organizations' section, Memory's scope toggle and Task
      Types' selection survive a reload — each proven by a test that
      navigates, reloads, and asserts the same view.
- [ ] Switching project from a task detail view does not leave a stale task
      open, and a **hard reload of a task URL keeps it open** — the M23
      regression, which the URL change is most likely to reintroduce.
      `Tasks/index.test.tsx`'s four `previousScope` cases pass, including
      hydrate-from-empty.
- [ ] `Artifacts` uses the same hydration discriminator as `Tasks` rather
      than the `isFirstRender` guard `Tasks` abandoned, with a
      hydrate-from-empty test it currently lacks.
- [ ] Opening `/memory/:beliefId` for a belief outside the active scope
      resolves against the belief's own scope rather than rendering it under
      the wrong org — with a test.
- [ ] Every in-app link preserves scope: no navigation within the shell
      silently drops `?org`/`?project` — enforced by a test over the link
      helper, not by inspection.
- [ ] Breadcrumbs render on every deep-linkable detail view — Tasks,
      Artifacts, Memory and Task Types — each ending in the entity and each
      intermediate crumb a working link.
- [ ] `NAVIGATION.md` documents the scope convention and its breadcrumb rule
      is true as filed; `moon run :doc-drift` and `docs-lint` pass.
- [ ] `moon check --all` clean, including the 95% GUI coverage gate and the
      Storybook a11y/375px gates.

## 4. Scope

**In Scope**: scope as `?org=…&project=…` with the URL as source of truth
synced into the existing store (ADR-0025); a `useScopedTo` link helper and
its application to nav and in-app links; a shared test render helper;
navigational state into the URL for Bin (`tab`), Organizations (`section`),
Memory (scope toggle) and Task Types (a `:typeId` route param, which already
fetches by id); collapsing Memory's route-param-mirrored `useState` and
fixing its cross-scope resolution; bringing `Artifacts`' hydration guard up
to `Tasks`'; a `useScopeLabels` resolver and breadcrumbs on the four
deep-linkable detail views; `NAVIGATION.md`; ADR-0025.

**Out of Scope** (each with its reason):

- **Teams and Roles selection in the URL.** Both find the selected row inside
  the currently loaded page, so a deep link past page one resolves to
  nothing. Fixing that needs `getTeam`/`getRole` by-id RPCs — a contract
  change, and disproportionate here. Named rather than half-done.
- **Artifacts' `selectedFolderId` in the URL.** It is *derived* — a
  deep-linked artifact sets it asynchronously from the artifact's own
  `folderId` — so URL-ifying it means a write-back on resolve. Real work, and
  the folder crumbs stay unlinked labels until it lands.
- **`expandedFolderIds`.** A `Set`, reconstructed by the existing
  ancestor-walk from the selection. Encoding it would be a lot of URL for a
  view detail that is already derived.
- **Transient editing state** — the open inline-edit forms in Agents,
  Projects and Labels. Deliberately *not* addressable: each is paired with
  unsaved draft text that the URL would not carry, so restoring the form id
  without its draft is worse than not restoring it. Bookmarking a
  half-finished edit is not a feature.
- **Scope-aware Global Search.** Results are org-scoped and may name entities
  in another project; the backend returns no project id per result, so this
  needs a contract change (ADR-0025's "foreclosed").
- **Slugs instead of ids** in the URL — needs a slug column and a resolver.

## 5. Task Breakdown

- [x] **M28-T01** — Save the design record: the spec folder (the audit, the
      three latent bugs it found, the navigational-vs-transient rule) and
      `ADR-0025` (query params over path segments over persisting the store;
      URL as source of truth synced into the store). No product code.
      - Files: `.specs/specs/2026-08-23-2300-addressable-screens/*`,
        `.specs/adr/ADR-0025-*.md`,
        `.milestones/MILESTONE-28-addressable-screens/*`, `.milestones/STATE.md`
      - Verify: files exist; `moon run tasker:docs-lint` passes.

- [x] **M28-T02** — The shared test render helper, first, because every task
      after this one multiplies across ~30 hand-rolled `MemoryRouter` +
      `QueryClientProvider` setups otherwise. `src/test/renderScoped.tsx`:
      render at a given URL, with a scope, returning a location probe.
      Adopt it in the three tests that already assert on the URL so it is
      proven against real cases before it is relied on.
      - Files: `apps/gui/src/test/renderScoped.tsx`,
        `features/{Tasks,Artifacts,Memory}/index.test.tsx`
      - Verify: `moon run gui:test` — those three suites pass through the
        helper with unchanged assertions.

- [x] **M28-T03** — Scope in the URL: a `useScope()` reader and a single
      sync point writing `?org`/`?project` into the store; the switcher and
      the two other scope correctors (`Organizations`' snap-to-first,
      `Projects`' archive-clears-active) write the URL instead of the store;
      auto-select uses `replace: true`. Store readers stay untouched.
      - Files: `apps/gui/src/store/layout.ts`, a new `hooks/useScope.ts`,
        `components/layout/{AppShell,OrgProjectSwitcher}.tsx`,
        `features/{Organizations,Projects}/index.tsx`
      - Verify: `moon run gui:test`; the M23 four-case `previousScope` suite
        green, hydrate-from-empty included.

- [x] **M28-T04** — Every in-app link preserves scope: a `useScopedTo`
      helper, applied to `NAV_GROUPS` and to the ~10 link/navigate sites
      (Dashboard, Reports panels, Agents, Tasks' handoffs link, NotFound).
      A test asserts the helper preserves scope and that no shell nav link
      drops it.
      - Files: `apps/gui/src/hooks/useScopedTo.ts`,
        `components/layout/AppShell.tsx`, the link call sites
      - Verify: `moon run gui:test`; `gui:design-lint` (nav is a WIG surface).

- [x] **M28-T05** — Navigational state into the URL: Bin `?tab=`,
      Organizations `?section=`, Memory's scope toggle, and Task Types as
      `/task-types/:typeId` (it already fetches by id, so the deep link is
      nearly free). Each validated against its known values, each falling
      back to today's default when absent or unrecognised.
      - Files: `features/{Bin,Organizations,Memory,TaskTypes}/index.tsx`,
        `App.tsx` (the new route)
      - Verify: `moon run gui:test` — one reload-survives test per screen.

- [x] **M28-T06** — The three latent bugs the audit found, each with the
      regression test it lacks: `Artifacts`' `isFirstRender` guard replaced
      with `Tasks`' `previousScope` discriminator; Memory's mirrored
      `useState` collapsed onto the route param and its `replace: true`
      changed to a push so Back steps through visited beliefs; Memory's
      cross-scope resolution fixed so a belief from another project does not
      render under the active org.
      - Files: `features/{Artifacts,Memory}/index.tsx` (+ tests)
      - Verify: `moon run gui:test` — each bug reproduced red before the fix.

- [ ] **M28-T07** — Breadcrumbs: a `useScopeLabels()` resolver for the org
      and project names every scoped trail needs (the switcher computes both
      and throws them away today), then crumbs on Memory and Task Types to
      match Tasks and Artifacts. Stories for each new trail.
      - Files: `apps/gui/src/hooks/useScopeLabels.ts`,
        `features/{Memory,TaskTypes}/index.tsx` (+ tests, + stories)
      - Verify: `moon run gui:test`; `moon run gui:storybook-test`.

- [ ] **M28-T08** — Prove it end to end and close: a Playwright test that
      copies a URL from one browser context and opens it in a second with a
      different last-used project, asserting identical scope and content;
      `NAVIGATION.md` documents the scope convention and its breadcrumb rule
      becomes true; full verification; closeout.
      - Files: `apps/gui/tests/e2e/addressable.spec.ts`,
        `.specs/design/NAVIGATION.md`, `.milestones/*`
      - Verify: `moon run gui:e2e`; `moon check --all`; `:doc-drift`.

## 6. Verification

```bash
moon check --all
moon run gui:e2e
moon run gui:storybook-test
```

## 7. Risks

- **Reintroducing the M23 deep-link bug.** The `previousScope` discriminator
  depends on the store starting empty; ADR-0025's decision to keep the store
  as the read surface preserves that by construction, but it is the single
  thing most likely to break and it fails *silently* — a reload that quietly
  drops you to the list. The four-case suite is the guard and is named in the
  exit criteria for that reason.
- **Links silently dropping scope.** A missed call site does not error; it
  just loses the project. Hence a helper plus a test over it, rather than
  auditing call sites by eye.
- **Test churn swamping the work.** Nineteen test files mock the layout
  store and nine render with no router at all. T02 exists first precisely so
  the change lands against one helper instead of thirty setups.
- **Coverage gate.** The GUI holds a hard 95% aggregate; new hooks are small
  and highly branchy (absent param, unrecognised value, scope change), so
  they need their own tests rather than incidental coverage.
