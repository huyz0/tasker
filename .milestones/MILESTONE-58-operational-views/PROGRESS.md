# M58 — Operational Views progress

## M58-T01 — URL-owned task/report view state

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Validated URL-owned Tasks settings and Reports windows, narrow live navigation writers, urgent lossless search editing, semantic/native sortable table and reachable phone recovery; accompanying screen/parser/history tests, permanent browser regression and real-screen previews.
- **Verified**: All36 local checks pass (12m24.508s): GUI1701/95.21% branches, backend2377/zero failures, contract1128, CLI and builds. CODE-v4/UX-v5 approve.37 previews pass148 WCAG/contrast and74 overflow scans; six actual layout/theme journeys, final native/history browser8.5s, explicit-default/order reds and corrected delayed POST200 departure proof pass. M57 is published80f7e97 with all10 post-main jobs passed. Reconcile this owned checkpoint onto that identical-tree published base before T01 publication.
- **Notes**: Frontend/security plus TDD apply. Reuse ADR0025's URL-authority decision rather than invent a competing persistence layer; no new ADR is needed for extending that already-selected policy. Produce UX/test plan before runtime edits. Supported state is limited to existing controls: Tasks board/table, text, priority, ready and table sort; Reports7/30/90-day window. Existing project/org scope remains authoritative; dialogs/drafts/bulk selections/results are not serialized. Task open/close preserves the current list settings. Ordinary scope selection retains valid scalar settings and clears transient selection; no cached/saved definition silently rewrites scope. Keep existing tokens/fonts/palette and use the independently researched M51 direction; do not use a repo design skill as visual authority. Named-definition ownership/server policy remains T02, before that code.
- **Next**: Publish this T01 checkpoint through actual hosted CI/main independently; M58-T02 then defines and persists tenant-safe named definitions. M58 remains open.

### T01 initial runtime regressions

- Initial task/report screen run fails12 new URL/history/open-close/recovery/selection cases; the separate organization-only selection case also fails before correction. URL parsers/writers, immediate replace text with debounced RPC reads, current-list task navigation and source settings make all21 selected screen cases pass. Later no-op-history and filtered-empty regressions fail before their corrections. Six affected files then pass168 cases, including existing scope/enum behavior and parser/writer boundaries.
- UX-v1 independently approves the proposed URL behavior and identifies breadcrumb exit, priority0, ID-to-createdAt sort, raw filter/org/sort/mode selection cleanup and live writer guards. Runtime follows those boundaries. An actual filtered table's old first-task prompt is replaced with no-matches/Clear filters while preserving Table mode/sort. Full screen preview states are being added; explicit app types pass. Early check commands from the monorepo root selected no DOM environment or config; corrected package-root commands run the real tests/types. No assertion/deadline is relaxed.

### Publication of the candidate base

- M57 PR #10 final2076ff9 passes all8 actual jobs in CI42871675560 and merges to main80f7e97. Fetched published and tested trees match exactly (facc43718ea1af0dfd58c08412b59a33b5a24cfa). Post-main CI42877838912 and integration42877839320 are queued. Preserve this owned candidate worktree; after T01 has a clean atomic checkpoint, reconcile only its own work onto the published base without force-pushing or discarding earlier checkpoints.

### T01 live typing feedback

- The first live cross-screen journey needs an actual report exception, but the new fixture's tasks are younger than the real24-hour unclaimed threshold. Age only the two owned test tasks to48hours and make the synthetic report preview use the same real condition; no production rule changes.
- Real fast keyboard typing then exposes a new implementation defect hidden by whole-value change events: router transitions restore the controlled input before each URL acknowledgement, losing characters (Review becomes w). A permanent Playwright case also fails (Release regression becomes Rren) before correction. Record the editing/applied-state boundary in UX, keep urgent local input value, and accept resync only from a current live URL. Applied queries remain URL-owned, writes remain immediate replace and RPC debounce remains unchanged. The permanent case then passes in6.0seconds, including reload and keyboard/history navigation. Six-width/theme real journeys are rerunning before visual/fault/review/full gates.

### T01 final runtime and restored fault

- Post-main M57 CI42877838912 now passes all8 jobs; integration42877839320 passes both real jobs. This is repository publication, not production deployment.
- Final six real browser journeys pass at375/768/1280px in both actual data-theme values, including native keyboard, task X/breadcrumb/Escape/backdrop exits, report links/window requests, reload/history, malformed recovery, canonical authorized task scope and a held delete response after leaving Tasks. Report keyboard proof waits for the native Space action's observable selected state before inspecting the raw URL; the earlier immediate read was premature.
- Final affected six files pass168/168 in33.76seconds after the fast-typing fix. Explicit app, node and permanent E2E types pass. Storybook builds352 stories;33 directly affected task/report/shell previews are under rendered review, with the shared-helper CurrentUser preview to check separately.
- Removing the live owning-route guard makes the real BrowserRouter regression fail: a late task writer adds q=stale+input to Reports. Source is restored in finally. The actual fast-keyboard regression also proved red before the product fix and green after it.
- gh exists but the local-ci-run check reports `gh act plugin is not installed.` No additional installation is attempted. Full Moon checks and actual hosted final-head CI remain the validation path; no gh-act result is claimed.

### T01 rendered feedback

- First33-preview matrices identify four failures: two Reports play assertions use the wrong existing retry label, and two newly exposed Table states fail real axe because button elements override their native role with columnheader and rowcount is placed on rowgroup. These are real unverified states, not a clean matrix.
- A new permanent accessibility regression fails before correction because the table lacks full rowcount. Sort headers now contain native buttons and expose aria-sort; table rowcount includes its header and full filtered total, and virtual rows expose their actual positions. Existing sort tests click the actual native control. Reports preview uses the real Try again label. No axe rule, assertion threshold or readiness deadline is disabled. Rebuild and repeat affected matrices before completion.

- Targeted rendered feedback after header/count correction proves the old horizontal header clips Status/Pull Requests at375px, and the empty-state message is an invalid direct table child. Keep header and virtual rows in one wide accessible table inside a shared horizontal scroller; keep empty/loading/error messages outside its semantic table. Native header controls remain reachable. A permanent browser assertion tabs to Status, checks its viewport bounds and changes sort by Space. Three explicit Table empty/loading/denied stories are added. The Reports preview's three independent sources settle separately, so its exact-count assertion polls until all three actual retry controls are present rather than accepting the first partial render.

- Independent review identifies a concrete shared-scroller recovery edge. Actual375px rendered error state reproduces it: after focusing Status, Try again has x=-207.625px. The narrow recovery region now sits outside the horizontal scroller; a permanent DeniedTable play checks its left/right viewport bounds after focusing the wide header. The attempted real aborted-read version initially stayed in normal retries, so it is not claimed as an observed error transition; the settled error-state reproduction is the decisive red.
- The subsequent37-preview run passes all35 non-Reports-error stories. The last two are fixture/assertion defects: Storybook expect does not provide poll, and Trends has an additional taskTypeId query-key slot. Correct the synthetic key exactly and use the existing supported waitFor assertion without weakening its exact three-control outcome. Both production table ARIA and phone overflow checks pass on that run.
- The regenerated real journey passes its first three theme/width cases before one raw URL read occurs before the native Enter handler's observable render. Match the existing native Space proof by awaiting aria-sort, then inspect the raw URI. The permanent actual Tab/Space/fast-type/reload/history case passes9.7seconds. Final real journeys, matrix and full gate still remain required.

- The final layout's six real journeys pass at375/768/1280 in both themes. Scrolled error-state recovery is restored from x=-207.625px to x=144.375px inside375px, and its permanent preview covers that viewport condition. All37 mobile-overflow previews pass74 theme cases. The accessibility run passes36/37 previews, with only an intermittent Reset play assertion; it succeeds in isolation and now awaits the actual selected/recovery render through the supported waitFor without changing its expected state or deadline.
- A second no-op regression proves that unchanged Board state on a shared URI whose q precedes org creates a duplicate history entry solely through parameter reordering. Compare normalized key ordering for equality before navigation while preserving actual target serialization and duplicate/invalid handling. The regression is red before correction; final native/history browser proof and full checks follow the correction. Existing layout captures remain final for the layout; this last change only suppresses semantically unchanged writes.

- Verification correction: inspecting the owned temporary rows shows the earlier held-delete harness intercepted the CORS OPTIONS preflight rather than the actual POST, so it did not establish a committed delete response arriving after departure. Other six navigation assertions stand; that stronger mutation claim does not. The two known owned temporary tasks are soft-deleted through the real authorized RPC (both200). The rerun intercepts only POST, requires actual200 before holding it, and finally repeats idempotent cleanup. No production permission/deletion behavior changes. Regenerate clean fixture captures and run the actual corrected case before claiming it.
- The parameter-order no-op correction passes all4 writer cases. Final permanent fast-input/native Tab+Space/reload/history passes18.9seconds after that correction; explicit app/E2E types pass. The final355-story build includes the supported waitFor recovery assertions;37 affected previews are rerunning.

### T01 final semantic and mutation verification

- CODE-v3/UX-v4 reject the remaining explicit-default history variant. Four new task/report default cases fail before correction. Compare canonical supported before/next definitions when the original parse is valid; retain invalid-key cleanup on Reset. All8 writer and14 report cases then pass22/22; CODE-v4/UX-v5 approve with no remaining source blocker.
- Actual held POST initially returns403 through Playwright route.fetch, whose plain-text response begins Loopback; the direct owned RPC still returns200. Forward the browser's exact request body/authenticated headers through Bun's working direct loopback client, preserving actual backend authorization, and hold that successful response only. The dedicated real browser check now proves POST200 occurs before leaving Tasks; releasing it after selecting Reports90 keeps the correct screen/window. It finally performs idempotent cleanup of only its created task. No production auth/CORS/network policy is altered.
- Build5's37 directly affected previews pass148 WCAG/contrast scans and74 phone-overflow scans, including offscreen-recovery regression and all synthetic Reports sources. Those rendered matrices precede only the final semantic no-op comparison; the permanent native browser case is rerun after it, while full source checks and hosted final-head rendered/E2E gates remain mandatory. Six layout/theme navigation journeys stand, with the corrected mutation case proven separately rather than inheriting the former preflight claim.

### T01 closure

- `GOTOOLCHAIN=go1.26.10 GOFLAGS=-buildvcs=false VITEST_MAX_WORKERS=2 MOON_CONCURRENCY=1 GOMAXPROCS=2 moon check --all` passes all36 tasks in12m24.508seconds. GUI121 files/1701 tests,95.21% branches; backend2377 tests/zero failures,95.92% functions/96.86% lines; contract1128 tests, CLI87.4% statements and production/standalone builds pass. Local opt-in socket/integration cases retain their explicit skips; gh-act simulation remains unavailable, not a claimed pass. Actual browser-to-owned-backend proofs and eventual hosted CI are separate.
- Final source's permanent native/fast-type/reload/history case passes8.5seconds; final1280dark journey also passes and refreshes the remaining clean-fixture captures. There are zero live owned temporary deletion-proof tasks after cleanup. Earlier deliberate route-guard and fast-type reds, table ARIA/phone recovery reds and no-op key-order/default reds are retained above; no assertion, deadline or coverage gate is weakened.
- Check T01 and URL exit criterion only.385 done/11 pending overall; M58 is1/4 tasks and remains in progress. Named definitions/permissions/UI/end-to-end sharing remain T02–T04. Commit source/tests/stories/checkbox/journal/state together, preserve the raw candidate checkpoint, reconcile only this owned unpublished task onto main80f7e97 without force-push, and publish T01 independently after actual final-head CI.

## M58-T05 — Observe live status styles after navigation

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Repair the existing status-color browser assertion after actual
  post-main E2E shows an empty computed style during Board/Table replacement.
  This is a small test-only follow-up; no new flow, API or visual policy needs
  an ADR. The exact same expected colors and ordinary deadline remain binding.
- **Verified**: T01 PR #11 passed all8 exact-head CI jobs and merged8dd8c1, with
  identical tested/published trees521aa13. Post-main42891977654 fails the dark
  status-color case in all3 attempts (expected RGB, received empty string);
  light also flakes. Other7 jobs and both integration42891977657 jobs pass.
  This actual existing-test failure is the behavioral red.
- **Notes**: Testing/UI testing plus TDD apply. Observe the selected mode and
  actual connected style through normal Playwright retry assertions, retaining
  board/table equality and three distinct state colors. Demonstrate that an
  actually wrong color still fails. Preserve the in-progress owned T02 checkout
  separately; this follow-up ships independently and does not include it.
- **Next**: Repeated both-theme real browser verification, restored wrong-color
  fault, full/pre-commit checks, independent focused review and final-head CI.

### T05 final verification

- The unchanged published assertion reproduces locally3 failed/3 passed in
  six real theme cases, with the same empty style result as hosted CI. Selected
  mode waits and retryable live style reads then pass20/20 repeated light/dark
  cases in1.8minutes, with zero retries. Three distinct colors and exact
  board/table equality remain unchanged.
- Deliberately force the actual Board headings to rgb(255,0,0): the exact
  toHaveCSS assertion fails against expected theme color at its unchanged
  ordinary5000ms deadline. Restore source in finally. No wrong-color fault
  remains in the commit. Explicit E2E types pass.
- All36 repository checks pass in20.685seconds (32 cached); production source,
  tokens and screenshots are unchanged. Existing full121-file/1701 GUI and
  backend2377 results are reused by the content cache. Optional gh-act and
  opt-in socket/integration skips remain explicit. CODE-v5 approves the focused
  test change. No new screen/Storybook state is needed for an assertion-only fix.
-398 total/386 done/11 pending; M58 is2/5. Publish after actual final-head CI,
  then resume the preserved in-progress T02 checkout and reconcile its candidate
  base after its clean task checkpoint. Both T01 post-main integration jobs are
  successful; the failing browser job is the reason for this follow-up.
