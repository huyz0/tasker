---
timestamp: 2026-11-10T20:09:16Z
decision: approved
---

# M58-T02 metadata authority and bounded audience amendment

Independent static re-review preserves ARCH-v1 and assesses amended ADR0044,
named UX and TC006a. No runtime implementation exists yet; only new review
records were written. No production/design/journal edits, services or tests
were performed.

The project metadata boundary now explicitly checks actual project:read before
returning a current project name. An omitted optional name/generic context keeps
declared-audience configuration metadata usable without expanding project
metadata visibility. Source-query rights remain independent on Create/Get.
TC006a requires this distinction for org:read without project:read, including
Get metadata. Lack of a readable name should use generic Saved project context;
actual unavailable-reference state remains a separate fact, not a permission
inference. This resolves ARCH-v1's proposed-boundary gap.

The optional audience selector is authorized, included in cursor identity and
absent only for the same permitted union. Independent bounded section pages
avoid an inaccessible catalog hidden behind a mixed first page. Their filter,
count, failure/retry and draft-preservation acceptance is concrete. No fetch-all
or extra permission language is introduced.

The original human-only ownership/shared-admin, typed definitions, current
reference checks, obsolete cleanup, managed org purge and no-private-broadcast
policies remain coherent with actual source. No further static correctness,
coverage, architecture or security blocker identified. Both-dialect runtime
TDD, generated/wire compatibility, bounded query proof, rendered UI and final
gates remain future work. T01's reported merge/publication does not establish
those T02 outcomes or reconcile this checkout automatically.

```yaml
findings: []
```
