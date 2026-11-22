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
