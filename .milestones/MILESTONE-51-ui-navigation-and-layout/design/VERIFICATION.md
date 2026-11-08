# M51 verification evidence

Completed 2026-11-08 on `feature/m51-ui-navigation-and-layout` in `/workspace/tasker-ui`. The original M46 working tree and its uncommitted relay files remain unchanged.

| Check | Final result | Execution evidence |
|---|---|---|
| Local workspace gates | 35 completed, 25 cached | `/tmp/tasker-ui-t07-final-gates.log` |
| GUI suite | 96 files, 1338 tests pass | Same gate log |
| GUI coverage | Statements 98.36%; branches 95.25%; functions 97.23%; lines 98.75% | Same gate log; all four 95% thresholds pass |
| Affected real-browser journeys | 48 pass, one worker | `/tmp/tasker-ui-t07-browser-final.log` |
| Application captures | 48, no application console errors or document overflow | [Machine matrix](evidence/screen-matrix.json); `/tmp/tasker-ui-review/final/` |
| Selected Storybook accessibility/layout checks | 70 pass across 35 selected stories, light 1280px/dark 375px | [Machine checks](evidence/storybook-checks.json) |
| Audit script smoke check | Two account-state/theme checks pass | `/tmp/tasker-ui-t07-audit-script.log` |
| Design/contrast lint and GUI/standalone builds | Pass | Workspace gate log |
| Remote CI | Not run | Optional local gh/act simulation skips because these tools are absent |

## Browser scope

The 48 final journeys cover addressable routes and reloads, audit access, comments, dashboard and telemetry access, daily navigation/Not Found, report links/Unassign/filter changes, schedule create/run/skip/task navigation, rich task description editing, workflow start, grouped mobile navigation, empty/create/cancel automation at three widths, tablet toolbars, task scroll/history, board/table state appearance, compact dashboard panels and native keyboard disclosure/draft retention.

Application captures cover Dashboard, Tasks, task detail, Reports, Workflows and Schedules at 375/768/1024/1280px in both themes. Task captures wait for the rich comment editor to load. A curated eight-image set is committed with the [review](UI-UX-REVIEW.md); full captures remain in the execution workspace. The 70 selected Storybook checks combine the 64 unaffected checks from the initial 34-story sweep with six final shell/account checks after the discovered account naming defect was fixed. They inspect WCAG A/AA findings, actual rendered roots and uncontained horizontal overflow. Intentional task-board horizontal scrolling is allowed.

This is a targeted check of the changed UI, not a claim that every repository story passed. The existing development addon injection-script 404 is recorded separately; screen fixtures still render. Shell stories retain the real live-connection indicator, which can show offline without an event service.

## Failure evidence and corrections

- Original browser geometry: task content 48px at 375px; heading width zero at 768/1024px. Responsive regressions failed before the layout fix.
- Navigation group/accessibility assertions and both theme-specific status regressions failed before implementation.
- Automation: six component empty-state regressions failed before implementation; reverting the split breakpoint fails both tablet editor scenarios. Mobile schedule heading measured 128px before stacking actions below description.
- Density: three component regressions failed before disclosure/preview changes; the compact-dashboard regression measured 169px before correction. Forcing populated context closed deliberately fails its visibility test. Native keyboard disclosure and summary draft retention pass in Chromium.
- Final broad run caught two stale E2E heading expectations; the destination link is Account & system, while the actual telemetry section remains System health. The corrected final 48-journey run passes. A one-frame workflow width sample prompted polling for the same required geometry; three repeated 1280px runs and the full final run pass.
- Rendering shell/workbench stories exposed missing QueryClient providers. Synthetic cache fixtures now render their real screens without account credentials. Reports' nested-router fixture was also corrected.
- Rendered axe checks exposed a prohibited account-label attribute. Requiring the named group in CurrentUser.test.tsx fails before the semantic fix; all seven account tests and six final shell/account browser checks pass afterwards.
- The initial backend baseline exposed real/frozen-clock skew in the existing webhook delivery test fixture. T01 freezes creation time too and restores time after each test; production backend behavior is unchanged.

## Reproduction

Use the repository's pinned Bun/Moon toolchain and a disposable seeded backend with `ENABLE_TEST_LOGIN=true`, as required by the existing E2E suite. From `apps/gui`, run the affected Playwright files with the standard configuration and one worker:

```sh
bunx playwright test --project=chromium --workers=1 tests/e2e/ui-layout.spec.ts tests/e2e/ui-navigation.spec.ts tests/e2e/ui-automation.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/navigation.spec.ts tests/e2e/addressable.spec.ts tests/e2e/audit-trail.spec.ts tests/e2e/webhooks.spec.ts tests/e2e/workflows.spec.ts tests/e2e/schedules.spec.ts tests/e2e/reports.spec.ts tests/e2e/comments.spec.ts tests/e2e/task-description-rich-editor.spec.ts
```

This environment used a temporary Playwright override for `/usr/bin/chromium`, reduced motion and one worker; the repository's portable browser configuration is retained. With Storybook running at port 6006, run the delivered selected-story audit from the repository root:

```sh
bun .milestones/MILESTONE-51-ui-navigation-and-layout/design/audit-selected-stories.mjs
```

It uses Playwright's managed browser by default; `CHROMIUM_EXECUTABLE_PATH` can select an installed executable. `STORY_IDS` selects comma-separated story IDs; `STORY_OUTPUT` changes the evidence directory. Any accessibility, page-exception or uncontained-overflow finding returns a nonzero status.

Run `moon check --all` from the root for local workspace gates. This sandbox required `GOFLAGS=-buildvcs=false` because its injected empty parent `/workspace/.git` breaks Go VCS stamping; Go tests and coverage still execute. No production deployment or remote CI result is implied.
