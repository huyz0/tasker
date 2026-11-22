# UI scope and report navigation progress

## M59-T01 — Organization-wide automation scope

- **Status**: done
- **Date**: 2026-11-22
- **Baseline**: main134f2fa; all15 post-main checks pass. M50 is published;
  previous verification/recovery limits remain recorded, not reopened here.
- **Plan before code**: Follow remaining UI recommendations first. Clarify
  existing organization-wide workflow/schedule lists and show each schedule's
  own project. Preserve endpoints, authorization, list membership and start
  form scope. New data visibility needs an observable failing regression.
- **Artifacts**: M59 milestone, UX design, ADR-0050 and acceptance plan are
  recorded before code. They use independent W3C/Carbon guidance plus source
  judgment; the repository design skill is not treated as design authority.
- **Standards**: T01 uses frontend/security plus TDD; T02/T03 select
  frontend/UI standards plus TDD at their own start. Static prose/config
  uses the stated exception; do not add constant/class-name tests.
- **Runtime**: The selected Cloud environment is starting. A required wait
  remains pending; independent connected-GitHub source/research continues.
  No local execution, rendered capture or new application pass is claimed.
- **Next**: Reproduce the schedule-row gap, implement T01, then complete the
  independent Reports/presentation tasks with actual verification. Keep every
  task unchecked until evidence and four-lens review support completion.

### T01 actual red and scope presentation candidate

- GUI job137115116361 runs the new tests against unchanged application code:
  two intended failures (Project: Beta and Project: project-archived absent),
  with1764 existing cases passing. This is an actual hosted red, not inferred.
- Show each row's canonical project using the existing project metadata and
  ID fallback; selected metadata uses its checked foreground pair. Add
  explicit organization-wide scope to workflow/schedule purpose text.
- Keep list queries, URLs, authorization and start/edit behavior unchanged.
  Extend synthetic stories with an organization collection and a schedule
  from Operations while Release is selected. No credential or new endpoint.
- Update only old exact link-name assertions to include the new accessible
  project text. T01 remains unchecked pending real green/source review;
  no local execution or participant result is claimed.


### T01 completion — 2026-11-22

- **Status**: done
- **Changed**: Workflow/schedule collection scope copy, canonical schedule project labels with ID fallback, focused regressions and cross-project synthetic stories.
- **Verified**: Both new label regressions failed first in job137115116361. The unchanged T01 implementation passes11 schedule cases and the complete1770-case GUI suite in checked source17bda23, plus105 browser passes/three existing skips,401 story audits in both themes, and all37 repository tasks in7m29.856s. These are hosted results; no local executor or participant result is claimed.
- **Review**: CODE-REVIEW-v2 approves correctness, coverage, architecture and security for T01. Full milestone source is being normalized into three completed-task commits; intermediate task commits are not separately gated and the final combined head must pass its own checks.
- **Next**: M59-T02;399 done/one dropped/two pending out of402.

## M59-T02 — URL-fragment report sections

- **Status**: done
- **Date**: 2026-11-22
- **Plan before code**: Native links select Exceptions/Trends/Spend using the
  existing preserved fragment; no new path, query-definition or authorization
  boundary. Keep panels mounted/hidden to retain independent reads and CFD
  state. Use a page heading/current-location link and focus only on fragment
  transitions, including recovery; window-only changes retain control focus.
- **Artifacts/standards**: ADR-0050/UX/acceptance precede implementation.
  Frontend/UI standards plus TDD apply here. T01 has its minimal scope fix
  committed and awaits green/source review; it is not marked complete.
- **Red first**: Add observable fragment/history/focus, independent-read and
  invalid-fragment regressions before any Reports implementation change.
  Baseline has no section navigation. Do not infer a red from source alone.
- **Next**: Observe actual failures, then implement and update the old
  all-panels-at-once assertions to require every panel remain reachable.

- T02 red: CI run 44992604666, GUI job 137116868509: exactly three new navigation/direct-Spend/recovery cases fail; 1766 existing cases pass, including both T01 scope cases. Added an early real-browser section-location check before implementing Reports navigation.

- T02 browser red: CI44992988893 job137118054574 fails at the missing Trends navigation link after a real seeded Reports load. Implement native fragment links/current-location, default Reports heading, selected-section heading focus, recovery, toolbar wrapping and mounted hidden regions. Update old simultaneous-panel expectations; add direct state stories and extend the owned saved-view browser journey to retain Spend.


### T02 completion — 2026-11-22

- **Status**: done
- **Changed**: Native Reports fragments, current-location links, selected headings and layout-timed focus, invalid-fragment recovery, wrapping toolbar, mounted hidden sections, state stories and scoped/history/saved-view browser coverage.
- **Verified**: Three intended unit reds in44992604666 and a real missing-link browser red in44992988893 precede implementation. Source17bda23 passes18 screen cases,10 trend cases, the full1770 GUI suite,105 browser cases/three existing skips,401 story audits and all37 repository tasks. The real browser journey covers keyboard focus, retained CFD choice, shared window/project, Back and reload; the owned saved-view journey applies fresh project/window while retaining Spend.
- **Review**: CODE-REVIEW-v3 approves all four lenses for T02. Final combined-head checks remain mandatory; intermediate task commits are not claimed as separately gated.
- **Next**: M59-T03;400 done/one dropped/one pending out of402. Presentation and retained rendered evidence finish in the following task.

## M59-T03 — Presentation and accessible daily data

- **Status**: done
- **Date**: 2026-11-22
- **Plan before code**: frontend/UI standards plus TDD. Reuse system fonts and semantic color roles. Add a metric type role matching existing 24/32 numeric emphasis; adopt report caption/code/label roles and 44px reviewed controls without changing global density. Provide per-day accessible table values and contain spend-table reflow.
- **Red first**: Daily-data table regression and real 320/375/768/1280 browser target/reflow check are committed before T03 implementation. T02 window/saved-view controls retain original sizes so geometry can expose the gap. Await actual output. No rendered capture or local execution claimed.

- Run44993232374 exposed two test-code typing mistakes (Testing Library has no role-query exact option; its matcher is toHaveFocus), corrected without treating compilation as behavioral red. Its real browser journey reached sections and reproduced delayed section focus stealing a subsequent window click; use layout-timed focus and wait for the selected heading before the next action. The geometry fixture must choose seeded scope on desktop before resizing because the mobile sidebar is closed. Re-run the corrected presentation reproductions before T03 implementation. A bounded synthetic Reports screenshot export is temporary review evidence, removed from final CI configuration.

- T03 actual red: CI44993556736 browser job137119782423 has section navigation passing and target geometry failing at 24px versus44px. GUI job137119782374 confirms the missing Daily spend data table; six pre-existing trend tests still assume simultaneous visibility and now explicitly enter Trends and navigate between failure/exception states. All18 ReportsScreen cases and11 schedule cases pass in this run.
- Implement minimal metric/caption/code roles, wrapping44px report controls, a per-day accessible table and keyboard-scrollable spend table. Keep integer financial formatting, full numeric values and existing semantic fonts/colors; use the validated chart-series fill instead of a composed alpha brand fill. The initial transient resize screenshot contains a moving sidebar and is excluded from final visual evidence; disable animations and wait for stable layout in subsequent captures.

- Source1354dfd passes GUI build/component tests and reaches Storybook. Browser job137121382179 retains the section-location pass but finds document overflow during the first narrow section loop. CODE-v1 rejects presentation completion. Wrap the daily table in clipped text-alternative containment inside a positioned scroller, matching the chart kit rather than applying sr-only directly to an intrinsically sized table. Wrap the Flow label/select and give its control the same row target. Add state-specific reflow diagnostics; do not hide the document overflow or weaken the assertion. Move the existing focused browser check earlier after backend setup for quicker feedback.

- The next browser run reaches the strengthened Flow geometry check before the route transition/data render settles, returning a null box. Synchronize on the focused selected heading, visible region and actual loaded chart/control before measuring; no application assertion or target threshold is relaxed. Keep native section-focus and real RPC cases separate from the synthetic spend presentation fixture.

- With loaded-section synchronization fixed, the browser proceeds to enlarged text and finds overflow before changing section. The fixed-height mobile shell header cannot fit its brand/scope and utility groups when rem-based text and controls enlarge. Extend T03 to wrap that header with a minimum height, preserving its normal density and every control. Keep the same document-overflow and target assertions; include body outlier diagnostics and a bounded failure capture. The report table fix remains needed for intrinsic table containment; no global overflow hiding is introduced.

- Source17bda23 passes the complete real browser suite (105 passed, three existing skips), the focused2-case matrix, component/build, workspace, native MySQL and integration checks; final repository gate still runs. Actual four retained screenshots are inspected against M58's light375/dark1280 baseline. Enlarged text exposes a Churning title/action collision despite no document overflow, so add a real rectangle-overlap regression before changing shared panel composition. The synthetic spend image also motivates wrapping long agent labels and a visible scroll track; keyboard scroll works but financial columns should be closer to the label. Keep completion unchecked pending the corrected rendered review.

- Actual overlap red: CI44995816866 job137126639974 at light375px/200% text measures Churning text from x65..217.77 and the handoff action from x106.72..310 at overlapping y coordinates. Use rendered text ranges rather than the h2's narrow layout box so overflowing glyphs cannot evade the regression.
- Give panel title/purpose a flexible16rem basis with a maximum width and arbitrary-word wrapping; optional actions wrap as a separate group when space is insufficient. Keep desktop alignment. Let the Fleet grouping wrap inside that group. Wrap long spend labels in a reasonable minimum-width table with a visible thin scroll track, preserving all numeric values. Reset keyboard-scroll/capture position after proving interaction, so retained images show the normal starting layout.
- Prior source17bda23 actual checks: 1770 GUI tests,95.39% branches;401 Storybook stories×2themes×2widths with zero axe violations and401×2theme375px overflow checks;105 browser passes/three existing skips; all37 repository tasks completed (7 cached) in7m29.856s. Final source must pass again; prior green does not approve this visual correction.

### T03 completion — 2026-11-22

- **Status**: done
- **Changed**: Shared report type roles/metric token,44px reviewed controls, mobile shell reflow, flexible panel title/action groups, Flow and Fleet control wrapping, daily-spend text alternative and contained spend table. Numeric cell gutters separate adjacent values.
- **Verified**: Missing daily data,24px targets and375px/200% rendered-title collision all have actual reds. Source07e4dbc passes all14 checks:1770 GUI cases/95.39% branches;401 stories×2themes×2widths with zero axe violations;401×2theme375px overflow audits; all37 repository tasks (7 cached) in5m52.303s. The focused seeded navigation/presentation journey passes both cases. The layout matrix measures320/375/768/1280px, both themes and100/200% root text size, with visible loaded sections, target bounds, keyboard table scroll and rendered-text/action non-overlap.
- **Browser honesty**: The broad source run has104 first-attempt passes, one project-creation selector retry and three existing skips. Its trace resolves the failing selector to a hidden mobile project caption. The final candidate scopes that assertion to the created project heading inside main; no timeout, retry policy or product assertion is weakened.
- **Rendered review**: Four source-run captures were inspected against existing M58 light375/dark1280 baselines. Titles/actions no longer overlap, the mobile header wraps with enlarged text, and long spend labels wrap. Static numeric-cell gutters follow the inspected spend image. Written observations and the source-run/artifact link are retained; no pixel-equivalent-fixture or participant claim is made.
- **Artifact restriction**: Automatic approval review rejected copying screenshot bytes into git because application data could be disclosed beyond the authorized code push. No binary/base64 artifact is committed or exported by final CI; temporary review-capture code is removed. Existing source-run artifacts retain their normal seven-day policy. Code work and all rendered geometry assertions continue through the safer text-evidence alternative.
- **Review**: CODE-REVIEW-v4 approves correctness, coverage, architecture and security, resolving CODE-v1's presentation block. Final candidate CI is mandatory before merge; the changed test selector and static gutters must be exercised there.
- **Runtime**: The requested Cloud environment never became usable during source work. Hosted workflows supply the actual results; local gh-act/clean-tree execution, manual screen-reader testing and participant usability are not claimed.
- **Next**: Merge the final three-task delivery chain only after its own combined-head checks pass, then verify published tree/checks. Candidate402 tasks/53 milestones:401 done, one deliberately dropped, zero pending. Capacity and participant-study limits remain separate.
