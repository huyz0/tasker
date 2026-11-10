# M55-T04 contextual source reconciliation review v7

- **Date**: 2026-11-10
- **Reviewer**: independent existing human_workflows_review agent
- **Scope**: checkpoint859b232; source, tests and deterministic fixtures since f4dadcd
- **Decision**: approved for source; final verification remains required

## Four lenses

- **Correctness**: questions/approvals reconcile on settlement, including an
  already-answered conflict and a durably stale approval failure. Reviewer and
  assignment settlement retains existing source invalidations. Combined holds
  send both recorded agent/user IDs to the existing exact-pair RPC; this does
  not promise a new assignment-incarnation fence. Status/archive and task-edit
  paths mark Attention stale without introducing another resolution flow.
- **Authority**: write refusal only triggers a source read. It does not invoke
  the Attention read-denial fence or infer that task-read authority was lost.
  Existing organization-wide request epochs and disabled-query guards remain
  intact across event invalidation, resync and explicit recovery.
- **Source truth and compatibility**: comment creation invalidates Attention
  locally only for task comments. Event creation mappings read current source
  truth; edits/deletions do not manufacture task activity. Parent, terminal
  definition, actor and authority events preserve prior query roots while
  adding Attention. No mutation contract, scope, permission or dependency is
  added by these changes.
- **Coverage and maintainability**: reconciliation cases exercise mounted source
  controls plus the real reader, including retained-read write denial, stale
  closure, combined pair removal and artifact-comment independence. Native
  Connect frames exercise event-to-reader invalidation rather than mocking the
  live hook. Deterministic previews retain provider isolation and source labels.

No blocking finding remains. Nonblocking evidence precision: the status event
test currently uses domain.task.status_changed; the production publisher uses
domain.task.status_updated. Both take the same task-entity mapping, but the test
should name the actual published subject. No implementation file was edited by
this review.

Reported affected tests, three live browser journeys and nine restored behavioral
faults support this review; they were not independently rerun by this reviewer.
Current rendered matrices, full35 and applicable final-head CI remain closure
gates. Earlier review versions are preserved.
