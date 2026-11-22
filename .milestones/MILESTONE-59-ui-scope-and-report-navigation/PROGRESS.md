# UI scope and report navigation progress

## M59-T01 — Organization-wide automation scope

- **Status**: in-progress
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

## M59-T02 — URL-fragment report sections

- **Status**: in-progress
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

## M59-T03 — Presentation and accessible daily data

- **Status**: in-progress
- **Date**: 2026-11-22
- **Plan before code**: frontend/UI standards plus TDD. Reuse system fonts and semantic color roles. Add a metric type role matching existing 24/32 numeric emphasis; adopt report caption/code/label roles and 44px reviewed controls without changing global density. Provide per-day accessible table values and contain spend-table reflow.
- **Red first**: Daily-data table regression and real 320/375/768/1280 browser target/reflow check are committed before T03 implementation. T02 window/saved-view controls retain original sizes so geometry can expose the gap. Await actual output. No rendered capture or local execution claimed.

- Run44993232374 exposed two test-code typing mistakes (Testing Library has no role-query exact option; its matcher is toHaveFocus), corrected without treating compilation as behavioral red. Its real browser journey reached sections and reproduced delayed section focus stealing a subsequent window click; use layout-timed focus and wait for the selected heading before the next action. The geometry fixture must choose seeded scope on desktop before resizing because the mobile sidebar is closed. Re-run the corrected presentation reproductions before T03 implementation. A bounded synthetic Reports screenshot export is temporary review evidence, removed from final CI configuration.

- T03 actual red: CI44993556736 browser job137119782423 has section navigation passing and target geometry failing at 24px versus44px. GUI job137119782374 confirms the missing Daily spend data table; six pre-existing trend tests still assume simultaneous visibility and now explicitly enter Trends and navigate between failure/exception states. All18 ReportsScreen cases and11 schedule cases pass in this run.
- Implement minimal metric/caption/code roles, wrapping44px report controls, a per-day accessible table and keyboard-scrollable spend table. Keep integer financial formatting, full numeric values and existing semantic fonts/colors; use the validated chart-series fill instead of a composed alpha brand fill. The initial transient resize screenshot contains a moving sidebar and is excluded from final visual evidence; disable animations and wait for stable layout in subsequent captures.

- Source1354dfd passes GUI build/component tests and reaches Storybook. Browser job137121382179 retains the section-location pass but finds document overflow during the first narrow section loop. CODE-v1 rejects presentation completion. Wrap the daily table in clipped text-alternative containment inside a positioned scroller, matching the chart kit rather than applying sr-only directly to an intrinsically sized table. Wrap the Flow label/select and give its control the same row target. Add state-specific reflow diagnostics; do not hide the document overflow or weaken the assertion. Move the existing focused browser check earlier after backend setup for quicker feedback.

- The next browser run reaches the strengthened Flow geometry check before the route transition/data render settles, returning a null box. Synchronize on the focused selected heading, visible region and actual loaded chart/control before measuring; no application assertion or target threshold is relaxed. Keep native section-focus and real RPC cases separate from the synthetic spend presentation fixture.

- With loaded-section synchronization fixed, the browser proceeds to enlarged text and finds overflow before changing section. The fixed-height mobile shell header cannot fit its brand/scope and utility groups when rem-based text and controls enlarge. Extend T03 to wrap that header with a minimum height, preserving its normal density and every control. Keep the same document-overflow and target assertions; include body outlier diagnostics and a bounded failure capture. The report table fix remains needed for intrinsic table containment; no global overflow hiding is introduced.
