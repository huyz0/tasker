# Standards binding M24 — Project Reports & Agent Insights

Per `AGENTS.md` §3, standards are loaded per *task* (at most two), not per
milestone — so this file routes rather than inlines (a copied standard is a
second copy that drifts). `.agents/protocols/tdd.md` binds every task and
does not count toward the two.

| Task | Surface | Load |
|------|---------|------|
| T02 | `packages/shared-contract/**` | `api-standard` |
| T03, T04 | backend DB + handlers | `api-standard`, `security-standard` (T04 touches authz-adjacent actor/tenancy stamping) |
| T05 | backend handlers/RPC | `api-standard`, `security-standard` (new RPCs: authz, tenancy, agent denial) |
| T06 | backend handlers + latency | `api-standard`, `observability-standard` (budget rows, measurement) |
| T07 | `apps/gui/**` components | `frontend-standard`, `ui-ux-standard` |
| T08, T09 | `apps/gui/**` screens | `frontend-standard`, `ui-ux-standard` |
| T10 | tests / e2e / closeout | `testing-standard`, `ui-testing-standard` (+ `milestone-standard` for the `.milestones/**` closeout edits, per the routing table) |

Points that repeatedly bit previous milestones, surfaced during design and
worth having in view for every M24 task:

- `api-standard` §6: report RPCs are not `list*` — they need **named**
  latency-budget rows (300 ms, like `getDashboard`), measured against
  `--scale large` seed data that actually contains `task_activity` rows.
- `security-standard`: every handler authorizes explicitly; new handlers
  must be registered in `agent-scope-sweep.test.ts` and
  `viewer-denial.test.ts` or they are silently unswept.
- `frontend-standard`: Storybook for every new component/screen, all four
  states; TanStack Query only; no `useEffect` fetching; 400-line file cap
  means `features/Reports/` decomposes from the start.
- `testing-standard`/`ui-testing-standard`: 95% aggregate coverage is a
  hard build failure; queries by role/accessible name only — the sr-only
  chart data table is the test surface, never SVG internals.
