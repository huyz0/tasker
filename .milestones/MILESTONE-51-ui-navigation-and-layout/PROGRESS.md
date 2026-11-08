# Progress — M51

## M51-T01 — Plan and researched direction

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: M51 plan, researched UX direction and acceptance scenarios.
- **Verified**: 35 local gates pass (26 cached); backend 2077 pass/37 skip, webhook fixture 11 pass; docs and milestone truth pass. Optional local Actions simulation skipped because gh/act are absent.
- **Notes**: Two full baseline runs exposed real/frozen-clock skew in the existing webhook delivery fixture (signed-send then retention cases); freeze delivery creation time too and restore it after every test. Go VCS stamping is disabled only for local checks because the sandbox injects an empty parent `/workspace/.git`; direct Go tests still run. Existing M46 working tree is preserved. M51 has no dependency on the event relay. UX design records the alternatives; no new technical boundary needs an ADR.
- **Next**: M51-T02.

## M51-T02 — Responsive task layouts

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: Browser regression scenarios for task heading/filter visibility and mobile task content scrolling.
- **Verified**: Three browser regressions failed before the fix and pass after it; 100 focused task/header tests pass, 19 dashboard/navigation/layout journeys pass, and all 35 local gates pass. Six mobile/tablet light/dark captures have no console errors or document overflow.
- **Notes**: Filters use an explicit toolbar slot; the mobile task body owns scrolling. Desktop retains two independently scrollable columns.
- **Next**: M51-T03.

## M51-T03 — Activity navigation

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: Navigation regression scenarios for grouped daily work and settings disclosure.
- **Verified**: Three navigation scenarios and the settings-group label assertion failed before their fixes; focused App/AppShell suite passes 39 tests. Two new navigation journeys and 27 existing layout/dashboard/addressable/audit/webhook journeys pass; 35 local gates pass.
- **Notes**: Existing route URLs and scoped links remain the navigation contract.
- **Next**: M51-T04.

## M51-T04 — Shared visual roles

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: Planned typography, density and surface aliases; consistent task status semantics across board and table.
- **Verified**: Both status-appearance regressions failed before implementation; all five layout/status browser checks pass in light/dark. Sixteen inspected captures have no console errors/overflow, contrast gate reports zero findings, standalone build and all 35 local gates pass.
- **Notes**: The full suite exposed another one-second lazy-route assertion timeout under coverage; routing-fixture waits are now uniformly bounded at five seconds and the assertions are retained. Preserve system sans and violet; reuse existing state token pairs and retain neutral fallback for custom statuses.
- **Next**: M51-T05.

## M51-T05 — Purposeful empty collection screens

- **Status**: done
- **Date**: 2026-11-08
- **Changed**: Planned empty-state regressions for workflow and schedule screens.
- **Verified**: 37 focused tests and eight real-browser journeys pass; empty/create/cancel covers 375/768/1280px. Six component regressions and the mobile heading regression failed before fixes; deliberate breakpoint reversal fails both tablet editor scenarios. Twenty Storybook state captures render without overflow; existing addon script 404 is documented. All 35 local gates pass.
- **Notes**: Preserve loading/error/retry and existing new-item routes; one creation action should lead into the same editor.
- **Next**: M51-T06.
