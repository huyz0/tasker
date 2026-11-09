# Review delivery plan — 2026-11-09

## Outcome and baseline

Make Tasker's existing human/agent workflows trustworthy, then make completed
work easier to review and intervention easier to find. Baseline main `579860f`
contains the completed authorization, atomic mutation, UI navigation/layout and
release-validation fixes (M44/M45/M51/M52, PR #1). Both GitHub workflows passed
before its squash merge. Existing M46 capture/storage is present but runtime
relay activation remains incomplete; do not describe durable delivery as live.

At the planning baseline this plan had 50 remaining tasks: 19 existing tasks, M46-T06, and 30 new tasks
in M53–M58. The full ledger is 396 tasks across 52 milestones, 345 done and one
dropped. Each linked milestone has stable task IDs, expected files, concrete
verification, exit criteria and rollback risks. No unfinished task is implied
complete by this planning document.

### Execution updates

M46 added T07 after actual CI exposed an obsolete unmanaged database fixture;
the ledger is now 397 tasks. M46 is complete and published in PR #3 as
`62a0c3f`, with all ten CI jobs passing. M48 started independently during that
final browser run because it depends only on M44; it proceeds before M47 and is
rebased onto the published M46 base. All other dependency and acceptance
boundaries below remain in force. Current completion counts live in STATE.md,
not the historical planning baseline above.

## Recommendation-to-task mapping

| Finding / accepted improvement | Task owner | Observable proof |
|---|---|---|
| Commit-before-publish event loss; capture not installed | M46-T03/T04/T05 | Kill after SQL commit; restart publishes the same stable ID and one audit row |
| Expired webhook owner regresses successor result | M46-T06 | A expires; B delivers; A fails/succeeds late without changing result/counters |
| Inactivity timeout permits indefinitely trickling HTTP | M46-T06 | Real trickling server hits a bounded total attempt deadline |
| Schedule advancement/work creation/history crash gaps | M47-T01–T04 | Both-dialect two-process kills recover the same frozen occurrence/work |
| Stream reconnect can leave current screen stale | M48-T01/T04 | Drop one mutation and reconnect; active scope refetches source truth |
| Feed overflow silently drops an entity event | M48-T02/T04 | Tiny queue emits scope-safe resync and dropped entity refreshes |
| Unary CLI calls never terminate on a hung server | M48-T03/T04 | Configurable deadline/cancellation ends unary; MCP stdio stays long-lived |
| MySQL crash suite exists but CI does not invoke it | M49-T01/T02 | Required real MySQL/NATS job runs it and deliberate break fails |
| Capacity target presented without measurements | M49-T03–T05 | Reproducible staged results name versions/hardware/data/errors/limits |
| Architecture/roadmap/runbooks lag implementation | M50-T01–T03 | Source check and exercised recovery commands; claims match evidence |
| Queue/search/deep links retain the wrong project | M53-T01/T02/T07 | Project B resource opened from A has B URL/sidebar/breadcrumb/actions |
| Memory search hits disappear; query errors look empty | M53-T03/T07 | All supported types route; failed current query offers retry |
| Old pending items excluded by a history page | M53-T04/T07 | Old open fixtures remain reachable beyond task/history and org page limits |
| Summary draft lost on Escape/route/task change | M53-T05/T07 | All exits guard/restore; failed save retains task-keyed draft |
| MCP contradicts advertised empty summary clearing | M53-T06 | Explicit empty string reaches one existing RPC; invalid IDs/text still fail |
| Workflow docs promise deterministic project-wide claim | M53-T06 | Example distinguishes dependency readiness from selection and parent policy |
| Worker cannot hand off existing artifacts through MCP | M54-T01/T02/T05 | Folder discovery → bounded create/link/read with current authorization |
| Completion needs inspectable evidence with bounds | M54-T03/T04/T05 | Opt-in digest metadata + explicit body read; human provenance view |
| Intervention scattered across queues and reports | M55-T01–T05 | Current source groups, complete pagination, canonical links, existing actions |
| Agent identity creation is called deployment | M56-T01/T02 | UI says Register and identifies external runtime responsibility |
| First connection/scoped setup is implicit | M56-T03/T04 | Exact issued token authenticates real request; no secret persistence |
| Assignment deletion erases claim attribution | M57-T01/T02/T04 | Durable generation receipt remains after release/unassign |
| Late reports or stale releases target wrong generation | M57-T02/T03/T05 | Expected generation fences release; optional owner/task-bound evidence |
| Tasks/Reports filters disappear on reload/history | M58-T01/T04 | URL owns view/filter/sort/window through Back/Forward/reload |
| Repeated operational queries need names/sharing | M58-T02/T03/T04 | Private default + explicit org-admin shared editing; definitions confer no access |

## Delivery order and task mechanics

1. **M46:** finish T03 relay, T04 activation/audit/draining, T06 webhook fencing,
   then T05 crash evidence/closure. Preserve old IDs even though T06 is delivered
   before T05. Port the original relay WIP into the isolated delivery worktree;
   leave the original working tree untouched.
2. **M47:** design occurrence semantics, atomic occurrence/advance, keyed leased
   execution, crash/sweep isolation. Keep UTC cadence and documented overlap.
3. **M48:** reconnect invalidation/jitter, overflow resync, CLI context/deadline,
   actual browser/CLI journeys. It is independent of M46 after M44.
4. **M53:** design, canonical entity scope, search types/errors, pending/history
   pagination, draft protection, MCP/docs correction, full workflow regression.
5. **M54:** evidence design/contracts, bounded RPC/MCP parity, opt-in digest,
   human review surface, real handoff verification.
6. **M55:** attention design, source projection, screen, existing actions/live
   reconciliation, complete supervision verification.
7. **M56:** connection design, registration naming/role flow, exact credential
   configuration/verification, first connection and secret/revocation checks.
8. **M57:** claim receipt ADR, transactional persistence/release fencing,
   optional note/usage/link attribution, paginated grouping, both-dialect wire
   and backward-compatibility verification.
9. **M58:** validated URL state, private/shared definition model and policy,
   save/open/rename/delete flows, authorization/history/deleted-resource checks.
10. **M49 and M50:** required production-dependency recovery CI, bounded load
    harness and staged measurements, pinned release gates, then architecture,
    integration docs and exercised recovery runbook. Feature milestones do not
    postpone their own tests/docs until this last step.

For each implementation task: select at most two relevant standards; open the
in-progress journal before code; write/run the behavioral regression; implement
and run focused plus affected full checks; update checkbox/journal/STATE and
commit together. Design tasks produce UX/ADR/test plans before code where a new
flow/data boundary needs judgment. Heavy work gets versioned independent review
of correctness, coverage, architecture and security. Publish finished milestones
through reviewable PRs and wait for actual required CI before merging to main.
All completed session fixes are authorized for publication.

## Reliability implementation acceptance

- Transactional capture is installed before serving writes. Unknown unary RPCs
  default to a write unit; explicit read RPCs and streams do not acquire it.
  Remote OAuth/provider fetches stay outside SQL transactions; invitations send
  mail after commit. Stalled alert claim + event share a per-candidate unit.
  Schedule bookkeeping/capture has an explicit fresh-context unit without
  swallowing provisional nested workflow writes.
- Relay uses ACKed JetStream publication with event ID as message identity and a
  bounded reference to full SQL payload. Stream provisioning is independent of
  consumer availability; initial broker failure retries and current health/feed
  subscriptions see the current connection. Standalone with no explicit NATS URL
  projects locally; explicit broker configurations stay pending during outage.
- Hydrate broker references from authoritative SQL and validate routing/identity;
  missing/mismatched references are failures, never legacy payload success. Audit
  deduplicates producer IDs, removes stream-sequence uniqueness in both dialects,
  preserves occurredAt and migrates old rows without data loss.
- Fenced leases prevent stale completion/retry writes. Pending events never age
  out; delivery attempts have a total deadline. Shutdown stops new work and
  awaits actual SQL projection/worker promises before connection drain. Document
  poison message recovery and retention explicitly.
- Occurrences freeze author/input/slot and retain identity across advancement,
  execution and result crashes. Author permissions are rechecked. A failure is
  isolated from other schedules; retries reuse work rather than create more.

## UI and product acceptance

New screens reuse the independently reviewed M51 hierarchy, semantic color
roles, typography/spacing tokens and responsive controls. Evaluate rendered
375/768/1280 layouts in light/dark, reduced motion, keyboard and screen reader
semantics. Every data flow defines initial loading, true empty, query failure,
next-page failure, unavailable/denied, mutation failure and stale/live states.
Avoid speculative decoration: hierarchy and decision clarity govern the design.

- Entity scope comes from the authorized entity, not the current selector.
  Organization Memory remains organization Memory. Keep return context and
  protect metadata when the entity is inaccessible. The confirmed wrong-scope
  presentation is not described as a permission leak.
- Pending requests are separate from paginated history. Organization queues and
  attention groups use bounded source-aware cursors, never fetch-all and never
  mistake a capped dashboard/report summary for completeness.
- Summary dirty state covers Escape, backdrop, close, route/task changes and
  background refresh. Explicit cancel and successful save have clear semantics.
- Evidence is existing artifact content/links with provenance. Body bounds are
  enforced before materialization; do not guess base64 from MIME. A digest
  requests bounded metadata only; full content is an explicit authorized read.
- Attention reads current source records and uses existing decisions/actions.
  No second inbox/approval database or notification read-state is added.
- Connection verification means the exact agent token performed a real
  authenticated call at a stated time. It never means an external worker was
  started or remains alive. Show secret once; never store it in browser storage,
  URLs, global persistent state, logs or unrequested clipboard writes.
- Claim receipts preserve ownership facts only. Attempt ID is not authority;
  optional attribution validates task/org/credential owner, permits legitimate
  final usage after release and leaves omitted legacy correlation ungrouped.
- Saved views store validated query intent only. Private ownership is derived
  server-side; organization-shared editing uses explicit admin policy. Recheck
  authorization/resources on save/load/use; URL remains source of current scope.

## Verification, migration and rollback

Run affected full suites after focused checks; `moon check --all` remains the
local gate. Changes to persistence require fresh and populated SQLite/MySQL
migration tests. Contract changes use fresh optional fields, regenerated TS/Go
and wire checks. Screen changes require real browser journeys and meaningful
Storybook a11y/overflow coverage, not only mocked render snapshots. M49 makes
required external services fail clearly when unavailable rather than skip.

One complete acceptance journey: register worker → authenticate exact scoped
credential through MCP → claim project task → attach artifact → ask question or
request approval → resolve from attention → recover missed live event → reopen
URL/named view without lost scope/draft. Separate crash/restart, revoked token,
cross-task/agent/org and stale generation cases must pass as well.

Keep migrations additive when possible and preserve source records and legacy
audit/history. Do not fabricate receipt timestamps for old assignments. Record
any incompatible rollback at the migration; disable new exposure first rather
than delete data. Use disposable test databases, never reset an existing user's
data. Publish measured resource limits honestly; 20K agents remains a target
until demonstrated at that count.

## Deferred policy and product ideas

No hosted agent execution engine, generic chat platform, arbitrary workflow DSL,
automatic safe reassignment, forced external cancellation, hard budget/billing
enforcement, AI evidence grading or mandatory completion policy. Soft budgets
and structured completion-policy enforcement were exploratory and remain
deferred. Ordinary workflow parents remain independently claimable tasks; no
automatic roll-up or terminal-outcome redesign is included. The queue-dialog
masking suspicion was disproved and is not a fix in this program.
