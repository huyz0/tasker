# Standards binding M28 — Addressable Screens

Per `AGENTS.md` §3, standards are loaded per *task* (at most two).
`.agents/protocols/tdd.md` binds every task and does not count toward the two.

| Task | Surface | Load |
|------|---------|------|
| T02 | tests / fixtures | `testing-standard`, `ui-testing-standard` |
| T03–T05 | `apps/gui/**` state and routing | `frontend-standard`, `ui-ux-standard` |
| T06 | `apps/gui/**` bug fixes | `frontend-standard`, `testing-standard` |
| T07 | `apps/gui/**` components | `frontend-standard`, `ui-ux-standard` |
| T08 | e2e / closeout | `ui-testing-standard` (+ `milestone-standard`) |

Points worth holding in view for every task here:

- **The 95% GUI coverage gate is a hard build failure.** The new hooks are
  small and branchy — absent param, unrecognised value, scope change — so
  they need their own tests rather than incidental coverage.
- `ui-testing-standard`: query by role and accessible name only. A URL
  assertion goes through a location probe, never by reading component state.
- `frontend-standard`: Storybook for every new or modified component; the
  400-line file cap (Tasks and Artifacts already exceed it — do not make
  them worse).
- The M23 `previousScope` guard is load-bearing and fails *silently*. Any
  change near a scope-reset effect needs the hydrate-from-empty case
  asserted, not assumed.
