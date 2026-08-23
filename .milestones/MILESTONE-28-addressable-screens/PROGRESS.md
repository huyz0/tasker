# M28 — Progress Journal

Append-only. Newest entry at the bottom. One entry per task attempt.

## M28-T01 — Save the design record (spec, ADR-0025)

- **Status**: done
- **Date**: 2026-08-23
- **Changed**: `.specs/specs/2026-08-23-2300-addressable-screens/` (shape.md,
  plan.md, standards.md), `.specs/adr/ADR-0025-*.md`, this MILESTONE.md,
  STATE.md ledger + roadmap.
- **Verified**: files exist; `moon run tasker:docs-lint` clean.
- **Notes**: the URL-scheme decision was settled by one measured fact rather
  than taste — `AppShell` sits *above* the inner `<Routes>` (a descendant
  router inside its `children`, not an `<Outlet/>` layout), so it can never
  call `useParams`, and it is exactly where the single app-wide
  `useLiveEvents({orgId, projectId})` subscription lives. Path-segment scope
  would force converting that descendant router into a nested layout route,
  which silently turns twenty absolute paths relative and breaks the nav's
  `startsWith` active check with no error. `useSearchParams` works anywhere
  inside the Router. Recorded in ADR-0025 with the rest of the measured cost.
  Keeping the store as the read surface is the second decision and preserves
  the M23 deep-link guard *by construction*: `previousScope` discriminates
  hydration from a real switch by the previous project being empty, which
  only stays true while the store starts empty and fills a tick later. Path
  scope would have killed that arm silently.
  The audit also turned up three latent bugs that are not the missing
  feature — Artifacts still using the `isFirstRender` guard Tasks abandoned,
  and two in Memory (no cross-scope reconciliation; the route param mirrored
  into `useState` and written with `replace: true`, so Back never steps
  through visited beliefs). Each gets T06 and a regression test it lacks.
- **Next**: M28-T02 (the shared test render helper).
