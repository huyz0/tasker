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

## M58-T02 — Persist tenant-safe named definitions

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Add strict versioned definitions, human-only CRUD, derived identity, private SQL catalogs, current shared-admin/source checks, immutable queries/audiences, obsolete cleanup, additive SQLite/MySQL migrations and generated TS/Go bindings.
- **Verified**: All36 checks pass (17 cached,13m5.093s): GUI1701/95.21% branches; backend2420/zero failures/95.99% functions/96.86% lines; contract1158; CLI87.4%; production/standalone builds.175 affected/510 assertions, four native core/race/populated-upgrade cases,109.67ms list p95, six restored faults, old450/1314/187 plus18 binary roundtrips and real socket12/72 pass (one existing independent optional skip). ARCH-v2/UX-v7/CODE-v6 approve.
- **Notes**: Accepted ADR0044 limits storage to supported scalar definitions, never SQL/results/access grants. GUI controls remain T03. Full1 records one existing artifact read timeout; its unchanged18-case file and full2 with one GUI worker pass without changing assertions/deadlines. gh-act is absent, so optional local Actions simulation is skipped; actual hosted CI still gates publication.
- **Next**: Preserve the raw atomic candidate, reconcile only this owned task onto published main780499c with identical-tree proof, then push/PR and merge after final-head CI. T03 adds Save/Open/Rename/Delete controls. Main780499c already passes all10 post-main jobs.

### T02 proposed authority and recovery policy

- Proposed ADR0044 chooses versioned typed scalar definitions, immutable scope/
  audience, personal creator-only reads, existing org:admin for shared create/
  rename/delete, and fresh ordinary task/report permissions on Create/Get.
  Catalogs expose audience-authorized metadata only; Get earns query contents.
  Save creates a new name, Rename changes metadata, and explicit Open alone
  applies the URL. No new status/label filters or hidden overwrite is invented.
- Existing source confirms Tasks task:read at organization scope and Reports
  dashboard:read at project scope; match those actual checks. Retain obsolete
  project references for recovery, purge definitions with their owning org,
  bind bounded SQL lists/cursors to the visible rowset, and keep private names/
  query payloads off organization events. Names have checked namespace
  uniqueness across dialects. UX/TC005a–d record these concrete cases before
  runtime changes. Static design has no runtime TDD; backend reds follow design
  review. T01 CI currently has6 successes and2 browser jobs running.

- Initial static design review identifies two concrete acceptance gaps before
  code: reachability beyond first catalog page in independently grouped
  audiences, and project display-name permission separate from org metadata.
  Add audience-bound cursor selection, independent bounded Previous/Next/name
  filter/count/error/retry without draft loss, and explicit project:read-gated
  names/generic fallback. TC006a covers more than100 mixed entries and the
  metadata refusal. No runtime leak or completed implementation is claimed.

### Publication of T01

- PR #11 exact70a171c passes all8 jobs in CI42889507483, including complete
  Storybook and real browser E2E. It merges to main8dd8c110a32f197b928dc22ffe3c1eeb86d3e8f8.
  Post-main CI42891977654 and integration42891977657 are in progress. Preserve
  this candidate-derived owned checkout; reconcile its own clean T02 checkpoint
  onto published T01 before subsequent publication, without force-pushing.

- ARCH-v2/UX-v7 approve the amended static authority/recovery/paging design;
  ADR0044 is accepted. The initial new-service test file runs red because the
  handler does not yet exist. This is a new-feature absence, not claimed proof
  of an existing ownership leak. Semantic SQLite/both-dialect/wire and restored
  owner/admin/reference faults remain mandatory after implementation.

### T02 first persistence implementation

- Fresh SQLite runs34 semantic cases/126 assertions green, covering ownership,
  shared current administration, forged identity, allowed/default controls,
  names/concurrent conflicts, SQL privacy before paging/count, cursor scopes,
  source/name permissions, obsolete definitions/projects, org purge and private
  event refusal. Controlled substantive faults still must prove new refusal
  tests, rather than relying on the initial absent-module red.
- An initial full TypeSpec-emitter copy is wrong: the emitter drops existing
  scalar presence and go_package. The Go plugin refuses generation, exposing
  the missing option. Restore the entire checked-in old protocol byte prefix
  and append only the14 new messages/one service, explicitly preserving optional
  scalars from TypeSpec. Rerun generated TS/Go, real codecs and old-SDK checks;
  no incompatible generated copy is published or treated as valid evidence.

### T02 interrupted by published browser verification

- T01 post-main CI42891977654 has7 successful jobs; E2E fails existing
  ui-layout status-color assertions (Received empty computed style, varying
  statuses, including all3 retries in dark). Both real integration jobs in
  42891977657 pass. Inspect/fix this published assertion in the clean T01
  checkout as a separate recorded follow-up; preserve this dirty owned T02
  implementation and do not mix it into that PR. T02 is not complete.

### T02 resumed after published verification repair

- T05 PR #12 exact709387b passes all8 CI42897282729 jobs and merges780499c.
  Both post-main integration42899744563 jobs already pass; CI42899744169 is
  running. Bring its published plan/test/review/ledger state into this owned
  candidate explicitly, preserving all T02 source and design.398 total/386
  done/11 pending, M582/5. Actual history reconciliation still waits for this
  task's clean atomic checkpoint, then applies only owned T02 changes.
-175 affected backend cases/510 assertions pass across view ownership/codecs,
  exhaustive human/agent/viewer sweeps and read-unit classification. Viewer
  personal preferences remain allowed under ordinary read access; shared
  creation/rename/delete remain denied. Two new saved-view reads first fail
  the write-unit inventory regression, then pass after explicit classification.
- Five substantive restored faults make owner privacy, current shared-admin
  policy, referenced-tenant checks, real codec metadata and populated migration
  data-preservation assertions fail. Each source is restored in finally.
  SQLite populated upgrade/reboot passes; native MySQL, wire/legacy and full
  checks still gate completion.

### T02 native storage feedback

- Both populated SQLite/MySQL upgrade-and-second-boot cases pass; old work
  remains unchanged and new definitions persist. Native MySQL ownership/admin/
  reference/paging/name-concurrency case passes with list p9571.01ms against
  the150ms budget. Its separate orchestrated rename/delete race fails: the
  rename acknowledges success after the other transaction deleted the view.
- Use current locking reads for Rename/Delete within the existing runtime
  mutation unit. Ordinary Get/List stay reads. The regression accepts either
  typed optimistic refusal or serialization; it rejects false success and raw
  crashes. Record the current-row policy in ADR0044 and rerun native/affected
  checks before review. No unpublished persistence feature is claimed complete.

### T02 native race and real-client verification

- Current-row locking fixes the reproduced native rename/delete stale success.
  All four native cases pass: populated SQLite/MySQL upgrades and reboots,
  MySQL authority/name/privacy/paging plus the orchestrated race. The bounded
  mixed-catalog list p95 is109.67ms against150ms. Removing only the current-row
  lock reproduces stale successful rename on real MySQL; finally restores it.
- Actual published SDK compatibility preserves450 messages/1314 fields/187
  methods and18 real old/new binary roundtrips;14 new messages are additive.
  Checked-in previous protocol bytes remain an exact prefix, including optional
  presence and go_package. Backend explicit typechecking passes.
- Actual socket/generated-client flow initially exposes a fixture mistake:
  username invitations are consumed at registration, not sent directly into
  existing membership. Invite the owned member identity before registration.
  No production authorization is changed. All12 wire cases/72 assertions then
  pass, with one existing streaming prerequisite skip. The new case proves
  two-user private refusal, metadata-only lists, optional priority0 presence,
  shared current-admin rules, foreign scope denial and obsolete-project cleanup.
- Published T05 main780499c now passes all8 CI42899744169 jobs and both
  integration42899744563 jobs. Full local36 and final T02 review are running;
  no T02 publication or completed GUI save/open flow is claimed yet.

### T02 full-gate feedback

- CODE-v6 approves the implementation with no blocking findings. The first
  full run passes1700/1701 GUI cases but times out the unchanged existing
  artifact direct-link initial read at canonicalKnowledge.test.tsx:59 (still
  Loading this artifact, empty scope after the normal1000ms wait). No T02
  production GUI source changed. Inspect/rerun that file unchanged, then rerun
  the full gate with one GUI worker to remove local scheduling contention;
  no assertion, deadline or production permission is relaxed.
- Optional local Actions simulation is unavailable because gh-act is absent;
  the required project checks and actual hosted CI remain the publication gates.
- The three owned status-palette fixture tasks are deleted through authorized
  RPC200 responses; conditional updates restore only the private fixture's
  saved organization/project labels, and its private browser-session file is
  removed. Existing original services, user data and worktrees remain untouched.

- The unchanged artifact file passes18/18 in8.73s. Full2 with one GUI worker
  passes all1701 cases/121 files and95.21% branches; backend and remaining gates
  are still running. No test assertion/deadline/product source was changed.

### T02 closure

- Full2 completes all36 checks (17 cached) in13m5.093s. GUI1701/121 files
  passes at95.21% branches; backend2420 passes with88 explicit prerequisite
  skips and zero failures,95.99% functions/96.86% lines. Contract1158, CLI87.4%,
  lint/types/drift/reachability and production/standalone builds pass. The real
  native and actual socket runs above establish their prerequisites separately;
  skipped default integration targets are not claimed as exercised services.
- CODE-v6 approves; current-row source matches its restored final fault backup.
  Check T02 and the server-owned privacy criterion.398 total/387 done/10 pending,
  M583/5. GUI Save/Open flows and final milestone E2E remain T03/T04.
  Preserve/reconcile the clean checkpoint before actual final-head publication.

- Explicit repository pre-commit gate passes all36 checks (33 cached) in7.988s
  after closure/ledger updates. No local gh-act simulation is claimed.
