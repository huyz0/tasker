---
timestamp: 2026-11-09T16:18:00Z
decision: approved
---

# M53-T04 actionable work, bounded history and durable stale decisions

Independent reliability, agent/security and human-workflow reviewers approve the
corrected source. Four lenses find no remaining blocker against ADR-0047 and
TC-005/006. UX-v3 findings and its remount refinement are resolved.

Correctness: separate authorized SQL pending/closed predicates precede paging and
counts. Position and count identity include endpoint, resolved organization/task,
selector, filter and effective order. Bound mismatches fail InvalidArgument;
legacy unbound cursors restart the authorized first page. Unrelated lists retain
their original runtime-NUL count-cache format. MCP publishes/forwards closed as a
read-only list selector; it is never a stored status.

A narrow decision-owned unit includes current authorization, pending CAS, task
change, activity and event capture. Intentional stale closure commits as an
internal result before the existing FailedPrecondition is presented. Unexpected
storage/capture failures roll back; competing decisions cannot overwrite the
winner. Only this RPC joins the explicit local-unit inventory. Stale closure
emits neither a successful task-status event nor an approval-decided event.

GUI pages retain source PageResponse, deduplicate IDs, preserve forms on transient
refresh/later-page failures and retry the appropriate cursor. Known access loss
disables cached actions through unavailable retries, remount and scope return
until fresh success. Obsolete mutation notices cannot erase current-scope errors.
Organization queues refresh bounded loaded pages at15s while visible because the
single selected-project feed cannot cover every project; access loss stops this
fallback. No second stream or network-state store is introduced.

Observed verification:

- All35 local checks pass (25 cached): GUI1440/95.45% branches; backend2194 pass,
  57 gated skips, zero failures,95.80% functions/96.70% lines; CLI gate93.8%;
  standalone binary builds. The initial full run exposed an internal-result
  TypeScript narrowing error; the explicit string check and focused15 approval
  cases pass before the successful rerun.
- Forty-nine focused GUI cases pass, including two remount reds and A→B→A,
  concurrent resolution, retained typing, page retry, deduplication and off-feed
  refresh. Backend focused36/485 assertions pass.
- Real SQLite/MySQL16 cases/128 assertions verify closed rows/counts, organization
  pages beyond50, endpoint/status/task/two-authorized-org/order/filter cursor
  isolation, legacy restart, capture rollback, stale persistence and competition.
  Generated service descriptors exercise the actual interceptor method identity.
- Two actual RPC/SQL browser journeys pass task history23/13 and organization
  questions52/approvals51 across projects, later-page failures, retained answers,
  stale wire persistence/reload and dark375px0axe. The task Delete control's
  observed1.75:1 contrast defect is fixed with the existing semantic subtle pair.
- All18 rendered states pass72 settled light/dark ×375/1280 axe audits and18
  mobile overflow checks. Failed-refresh fixtures first mount successful data
  before entering failure; a prefailed cache is not misrepresented as accepted.
- Deliberately removing closed filtering, cursor binding, GUI next-page handling
  or access acceptance fails2/3/4/4 regressions respectively. Removing decision
  ownership and changing the legacy delimiter also fail; all source is restored.

Authorization precedes cursor use; cursors grant no capability. Human-only
approval authority is unchanged. No field renumbering, schema, dependency, font
or palette-family change. Final-head remote CI still gates M53 publication.

```yaml
findings: []
```
