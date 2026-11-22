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

## M59-T02 reopened — live-location race

- **Status**: done
- **Date**: 2026-11-22
- **Reproduction**: Final candidate job137131690750 changes90 days immediately before Trends; Back returns to a Trends URL without days90. A render-time section link can overwrite the already-committed browser query. Keep the failing real-browser assertion and add a deterministic live-history-gap unit regression before implementation.
- **Plan**: Reuse the existing currentLocation protocol for ordinary section/recovery activation, retain native link affordances and reject stale activation after leaving Reports. Frontend/UI standards and TDD apply. No service or saved-view-definition change.
- **Docs**: Workspace job137131690777 rejects two consecutive blank lines in the assembled journal. Normalize Markdown spacing in every staged task; this is static formatting.
- **Gate**: Add an early focused Reports regression step so this live-location contract fails before the longer GUI suite. Reopen T02/one pending task; no candidate with this failure is merged.

- **Actual deterministic red**: GUI job137133257376 runs19 focused screen cases: the new live-history-gap regression fails with days7 even though days90 is already committed;18 existing cases pass. The independent real-browser failure remains recorded in137131690750. Workspace formatting checks now pass.
- **Minimal fix**: Ordinary section/recovery activation uses the existing currentLocation reader, preserving all live query values. Modified clicks keep native anchor behavior; activating the current fragment does not add duplicate history, and a stale handler cannot resurrect Reports after leaving its path. Existing mounted queries, heading-focus rules and saved-view definitions are unchanged. Do not add a wait after the real90-day click to mask the race.

### T02 completion and live-location revalidation — 2026-11-22

- **Status**: done
- **Changed**: Native section locations/current headings, preserved query and mounted reads, layout-timed focus/recovery, currentLocation activation, state stories and browser journeys.
- **Verified**: Initial three unit reds and missing-link browser red precede implementation. Final candidate137131690750 then exposes the rapid-window navigation gap; deterministic job137133257376 fails the new case with days7 instead of committed days90 while18 earlier cases pass. Corrected source3ac8c9c passes all19 screen regressions,1771 GUI tests/95.34% branches,105 browser cases with no retries/three existing skips,401 story audits and all37 repository tasks in5m55.199s. The rapid browser activation remains immediate; no wait masks the race.
- **Review**: CODE-REVIEW-v5 revalidates all four lenses after the live-location correction; CODE-v3 remains the historical pre-race review. Final combined-head checks are still required before merge. Intermediate task commits are not separately claimed as gated.
- **Next**: T03 presentation/evidence;400 done/one dropped/one pending of402.

## M59-T03 — Presentation and accessible daily data

- **Status**: in-progress
- **Date**: 2026-11-22
- **Plan before code**: frontend/UI standards plus TDD. Reuse system fonts and semantic color roles. Add a metric type role matching existing 24/32 numeric emphasis; adopt report caption/code/label roles and 44px reviewed controls without changing global density. Provide per-day accessible table values and contain spend-table reflow.
- **Red first**: Daily-data table regression and real 320/375/768/1280 browser target/reflow check are committed before T03 implementation. T02 window/saved-view controls retain original sizes so geometry can expose the gap. Await actual output. No rendered capture or local execution claimed.
