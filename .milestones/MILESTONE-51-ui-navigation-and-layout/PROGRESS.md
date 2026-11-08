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

- **Status**: in-progress
- **Date**: 2026-11-08
- **Changed**: Navigation regression scenarios for grouped daily work and settings disclosure.
- **Verified**: Pending red run before implementation.
- **Notes**: Existing route URLs and scoped links remain the navigation contract.
- **Next**: Implement grouping and verify focus, scope and mobile navigation.
