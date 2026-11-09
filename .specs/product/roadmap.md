# Product Roadmap

Delivery is organised into **milestones** — each one a verifiable end state for
the product, not a bucket of activities. The plan, the task breakdown and the
committed progress for each live in `.milestones/`; the format is governed by
`.specs/standards/milestone-standard.md`.

Current delivery state: **`.milestones/STATE.md`** — read that first.
Report on it any time with `/milestone-status`.

---

## Phase 1: MVP — status

**Delivered.** Every capability below is built, and every milestone in the
ledger is closed (M12-T11, 2026-08-22). The "Owner" column names the milestone
that closed each gap rather than the one that still owns it.

The one thing worth reading twice: "Delivered" here means built *and* verified
against something real — a running server, a live broker, a container, a
browser, a mail server — not merely present in the source. Where that
verification found the feature broken, the finding is recorded in the
milestone's `PROGRESS.md` rather than quietly fixed.

| Capability | State | Owner |
|---|---|---|
| Core API, CLI, agent skills | Delivered | — |
| Real-time GUI | Delivered — server-streaming feed, targeted invalidation, reconnect with polling fallback, connection indicator | M08 |
| Single-bundle portable packaging with embedded DB and search | Delivered — one file carries the GUI, both dialects' migrations and FTS5; verified from an empty directory under `env -i` | M09 |
| Organizations & users, admin / non-admin roles | Delivered | — |
| Teams | Delivered | M10 |
| Google login | Delivered | — |
| Local username/password accounts, no email required | Delivered | M13 |
| Linking/unlinking an external identity to an existing account | Delivered | M13 |
| Invite users by email | Delivered — create, list, revoke, expiry, and the email is actually sent over SMTP (Gmail by default, any provider by `SMTP_HOST`). Off unless configured, and a delivery failure never costs the invitation | M03, M12 |
| Hierarchical organization structure | Delivered, with ancestor climbing in the policy engine | M10 |
| Task types and status enums | Delivered | — |
| Task state machines | Delivered — enforced by the API and configurable from the Task Types screen | M05, M15 |
| Project templates with root task type | Delivered | — |
| Projects from templates, owner assignment | Delivered | — |
| Agent roles and configuration | Delivered — scoped to one organization (ADR-0007) and creatable from the GUI | M03, M17 |
| Agent instances | Delivered — an agent is a principal with its own scoped, revocable, rate-limited token (ADR-0008) | M04 |
| Tasks with human-readable ids, status, description, comments, labels | Delivered | — |
| Task ↔ agent / human relationships (created by, assigned to, reviewers) | Delivered across API, CLI and GUI | M05 |
| Artifacts in nested folders | Delivered — nested tree and upload in the GUI | M05, M18 |
| Task-to-artifact links | Delivered across API, CLI and GUI | M05, M18 |
| Task comments and AI task notes | Delivered | — |
| Markdown throughout | Delivered | — |
| Artifact commenting | Delivered | M05 |
| List, search, sort, filter, page across core entities | Delivered — the GUI sends them, and no hot read path is a full table scan (gated) | M05, M07 |

## Phase 2: Post-launch — status

| Capability | State | Owner |
|---|---|---|
| GitHub / Bitbucket repositories, read-only | Delivered | — |
| Project ↔ repository links | Delivered | — |
| Tasks displayed with linked pull requests | Delivered | — |
| Build and deployment tracking | Delivered as a live pass-through, surfaced in the project repository panel | M05 |
| Universal search | Delivered — served by SQLite FTS5 / MySQL full-text rather than a `LIKE` scan (ADR-0002 superseded by M07) | M07 |

---

## Milestones

| ID | Milestone | Goal | Depends on |
|----|-----------|------|------------|
| **M01** | [Stabilize the Build](../../.milestones/MILESTONE-01-stabilize-the-build/MILESTONE.md) | Every existing feature works from a clean clone, and CI fails when one breaks. | — |
| **M02** | [Specification Truth](../../.milestones/MILESTONE-02-specification-truth/MILESTONE.md) | Every claim in `.specs/` is traceable to running code. | M01 |
| **M03** | [IAM Correctness & Scale](../../.milestones/MILESTONE-03-iam-correctness-and-scale/MILESTONE.md) | User, role and org management is correct and usable at 100k members. | M01 |
| **M04** | [Agent Identity & M2M Tokens](../../.milestones/MILESTONE-04-agent-identity/MILESTONE.md) | An agent is a first-class principal with its own scoped, revocable credential. | M03 |
| **M05** | [GUI / API Parity](../../.milestones/MILESTONE-05-gui-api-parity/MILESTONE.md) | Every capability the backend implements is reachable from the browser, and nothing on screen is fabricated. | M01 |
| **M06** | [UX, Design System & Accessibility](../../.milestones/MILESTONE-06-ux-and-design-system/MILESTONE.md) | One coherent visual system, operable by keyboard and screen reader, with no dead ends. | M05 |
| **M07** | [Read-Path Scale](../../.milestones/MILESTONE-07-read-path-scale/MILESTONE.md) | No unbounded fetch anywhere, and search served by a real index. | M05 |
| **M08** | [Events, Audit & Real-Time](../../.milestones/MILESTONE-08-events-audit-realtime/MILESTONE.md) | Domain events are consumed — producing an audit trail and a live-updating GUI. | M04, M07 |
| **M09** | [Portable Single Binary](../../.milestones/MILESTONE-09-portable-single-binary/MILESTONE.md) | One executable serves the entire product with no dependencies. | M05, M07 |
| **M10** | [Teams & Policy-Based RBAC](../../.milestones/MILESTONE-10-teams-and-policy-rbac/MILESTONE.md) | Roles and permissions are data; teams group people; access scopes below the org. | M03, M04 |
| **M11** | [Observability & Deployability](../../.milestones/MILESTONE-11-observability-and-deployability/MILESTONE.md) | Deployable to a real environment and debuggable there. | M08 |
| **M12** | [Test Depth & Release](../../.milestones/MILESTONE-12-test-depth-and-release/MILESTONE.md) | The client–server seam is tested, journeys are covered, the product is distributable. | M06, M09, M11 |
| **M13** | [Local Accounts & Linked Identity](../../.milestones/MILESTONE-13-local-accounts-and-linked-identity/MILESTONE.md) | A user can exist and log in on a local username and password with no email or external provider required; Google is one optional linked identity among possibly several. | M01, M03 |
| **M14** | [Task Reliability & Agent Self-Service](../../.milestones/MILESTONE-14-task-reliability-and-agent-self-service/MILESTONE.md) | Task mutations are correct under concurrent/retried writes, and an agent can discover, claim and complete work with no human broker. | M04, M05 |
| **M21** | [Shared Memory & Belief System](../../.milestones/MILESTONE-21-shared-memory-and-beliefs/MILESTONE.md) | Agents and humans share a searchable, scoped memory of durable beliefs with human-gated promotion. | — |
| **M22** | [Task Handoff & Continuity](../../.milestones/MILESTONE-22-task-handoff-continuity/MILESTONE.md) | An agent whose claim ends mid-task leaves a handoff note the next agent or human resumes from. | — |
| **M23** | [Rich Markdown Editor](../../.milestones/MILESTONE-23-rich-markdown-editor/MILESTONE.md) | Markdown surfaces are edited WYSIWYG while the wire contract stays plain markdown. | — |
| **M24** | [Project Reports & Agent Insights](../../.milestones/MILESTONE-24-project-reports-and-agent-insights/MILESTONE.md) | A project-scoped Reports screen shows where work is stuck, which agents need attention, and how work flows over time — every panel feeding an intervention decision. | — |
| **M25** | [Proactive Alerting for Stalled Claims](../../.milestones/MILESTONE-25-stalled-claim-alerting/MILESTONE.md) | A human responsible for a task is emailed when its agent claim goes stalled, without waiting for anyone to open Reports. | — |
| **M26** | [Gate Integrity](../../.milestones/MILESTONE-26-gate-integrity/MILESTONE.md) | Every quality gate covers what its own documentation says it covers — the agent-scope sweep, the migration ledger, and backend typechecking. | — |
| **M27** | [Documentation Truth](../../.milestones/MILESTONE-27-documentation-truth/MILESTONE.md) | The documents an agent session is told to treat as ground truth describe the product that exists, and a gate fails when they stop doing so. | — |
| **M28** | [Addressable Screens](../../.milestones/MILESTONE-28-addressable-screens/MILESTONE.md) | A URL carries its own scope, reopens the same thing for whoever pastes it, and every deep-linkable detail view shows a path back. | — |
| **M29** | [In-App Notifications](../../.milestones/MILESTONE-29-in-app-notifications/MILESTONE.md) | Delivered — a notification bell backed by per-user read state, fed by a type registry so the next alert type registers rather than rebuilds. | — |
| **M30** | [Backend Correctness at Scale](../../.milestones/MILESTONE-30-backend-correctness-at-scale/MILESTONE.md) | done: Every report and dashboard read works on MySQL, nothing a caller cannot read leaks through search, a claim means what the agent API says it means, and the hot paths an agent fleet hits on every call stop scaling with the size of the fleet or the history. | [] |
| **M31** | [CLI Output Truth](../../.milestones/MILESTONE-31-cli-output-truth/MILESTONE.md) | done: An agent can drive every CLI command from a script — output on stdout in one stable JSON shape, errors once on stderr with an exit code that says what kind of failure it was, and every page of a list reachable. | [] |
| **M32** | [Task Workspace Correctness](../../.milestones/MILESTONE-32-task-workspace-correctness/MILESTONE.md) | done: A human supervising agents from the task screen sees what the agents are doing as they do it, is never shown a stale or wrong value after their own edit, can only choose moves the server will accept, and is told when something failed instead of being shown an empty panel. | [M30] |
| **M33** | [Agent Work Queue](../../.milestones/MILESTONE-33-agent-work-queue/MILESTONE.md) | done: An agent can take the next piece of work in one call, give back work it claimed (with a handoff note) without a human, see everything it holds across the organization, and ask who it is — so a fleet can run the claim/work/handoff loop unattended. | [M30, M31] |
| **M34** | [Milestone and Doc Truth](../../.milestones/MILESTONE-34-milestone-and-doc-truth/MILESTONE.md) | done: Every milestone file says what is actually true of the product — status, exit criteria and dates agree with the boxes beneath them and with the ledger — every closed criterion has evidence behind it, and a gate fails the build the next time they drift. | [] |
| **M35** | [Work Graph](../../.milestones/MILESTONE-35-work-graph/MILESTONE.md) | done: Tasks carry a priority, can block one another, nest under a parent and record the task they were discovered from — and an agent asking for the next piece of work gets the most important task whose prerequisites are finished. | [M33] |
| **M36** | [MCP Server](../../.milestones/MILESTONE-36-mcp-server/MILESTONE.md) | done: Any MCP-capable agent can work a Tasker queue — find, claim, update, note, hand off and search memory — by pointing its client at one URL with its agent token, with exactly the permissions that token already has. | [M35] |
| **M37** | [Outbound Webhooks](../../.milestones/MILESTONE-37-outbound-webhooks/MILESTONE.md) | done: An organization can subscribe an HTTPS endpoint to its task events and receive each one, signed, at least once — so an outside agent runner starts work when work appears instead of polling or holding a stream open. | [M35] |
| **M38** | [Agent Plan and Input Requests](../../.milestones/MILESTONE-38-agent-plan-and-input-requests/MILESTONE.md) | done: A person watching a task sees the agent's plan and how far through it the agent is, and when an agent cannot proceed without a human it asks a question on the task, the right person is notified, and the answer reaches the agent. | [M35] |
| **M39** | [Approval Gates on Agent Transitions](../../.milestones/MILESTONE-39-approval-gates/MILESTONE.md) | done: An organization can mark a task-type transition as needing a person's approval when an agent makes it, so an agent can propose "move to Done" but only a person can let it happen - without slowing the transitions nobody needs to watch. | [M38] |
| **M40** | [Agent Usage and Cost](../../.milestones/MILESTONE-40-usage-and-cost/MILESTONE.md) | done: Agents report the tokens and money each piece of work cost, and people see it per task, per agent and per project - so the cost of autonomous work is visible where the work is. | [M35] |
| **M41** | [Task Digests](../../.milestones/MILESTONE-41-task-digests/MILESTONE.md) | done: An agent that needs an old or long task's context gets it in one compact read - a summary written once by whoever closed it, plus the facts Tasker already knows - instead of replaying the whole history. | [M38, M40] |
| **M42** | [Workflow Templates](../../.milestones/MILESTONE-42-workflow-templates/MILESTONE.md) | done: A team defines a repeatable piece of work once - its steps and which step waits on which - and anyone, person or agent, stamps out a live copy in one call, so agents work through the steps in dependency order without anyone wiring blockers by hand. | [M35] |
| **M43** | [Recurring Work](../../.milestones/MILESTONE-43-recurring-work/MILESTONE.md) | done: Routine work - a weekly triage, a nightly dependency check, a monthly report - appears on the queue by itself on schedule, as a single task or a whole workflow, so agents and people pick it up without anyone remembering to file it. | [M42] |
| **M44** | [Authorization Lifecycle](../../.milestones/MILESTONE-44-authorization-lifecycle/MILESTONE.md) | done: Current permissions govern every cached response and every long-lived subscription. | [] |
| **M45** | [Mutation Recovery](../../.milestones/MILESTONE-45-mutation-recovery/MILESTONE.md) | done: Concurrent and interrupted keyed mutations produce one committed outcome and a retry can recover that outcome. | [M44] |
| **M46** | [Durable Domain Events](../../.milestones/MILESTONE-46-durable-domain-events/MILESTONE.md) | done: Domain changes and their emitted events commit together, and persisted events reach audit and matching webhooks despite process or broker failure. | [M45] |
| **M47** | [Recoverable Schedules](../../.milestones/MILESTONE-47-recoverable-schedules/MILESTONE.md) | in-progress: Every claimed scheduled occurrence can be inspected and safely resumed after a crash without duplicating its work. | [M45, M46] |
| **M48** | [Client Recovery](../../.milestones/MILESTONE-48-client-recovery/MILESTONE.md) | done: Browsers reconcile missed changes and CLI calls terminate predictably when the server stalls. | [M44] |
| **M49** | [Production Evidence](../../.milestones/MILESTONE-49-production-evidence/MILESTONE.md) | todo: CI exercises production dependencies and reproducible multi-instance measurements describe the capacity actually demonstrated. | [M46, M47, M48] |
| **M50** | [Operational Truth](../../.milestones/MILESTONE-50-operational-truth/MILESTONE.md) | todo: Architecture, roadmap, agent guidance and operations documentation match verified behavior and recovery guarantees. | [M49] |
| **M51** | [UI Navigation and Layout](../../.milestones/MILESTONE-51-ui-navigation-and-layout/MILESTONE.md) | done: People can navigate, read and supervise agent work through a coherent interface at mobile, tablet and desktop sizes. | [] |
| **M52** | [Release Candidate Validation](../../.milestones/MILESTONE-52-session-release/MILESTONE.md) | done: The completed session fixes have reproducible release validation and pass local dependency and release checks. | [M44, M45, M51] |
| **M53** | [Workflow Correctness](../../.milestones/MILESTONE-53-workflow-correctness/MILESTONE.md) | todo: Every existing question, approval, search result and task edit keeps the correct scope, exposes all pending work and preserves user intent. | [M28, M51] |
| **M54** | [Completion Evidence](../../.milestones/MILESTONE-54-completion-evidence/MILESTONE.md) | todo: External workers can discover, attach and read bounded task evidence through MCP, and people can inspect that evidence with accurate provenance. | [M46, M53] |
| **M55** | [Attention Center](../../.milestones/MILESTONE-55-attention-center/MILESTONE.md) | todo: A person can find and resolve current questions, approvals, reviews and stalled claims from one scoped screen without losing underlying source truth. | [M48, M53, M54] |
| **M56** | [Agent Connection](../../.milestones/MILESTONE-56-agent-connection/MILESTONE.md) | todo: A person can register an agent, issue a least-privilege token, configure an external worker and verify that credential through an actual authenticated API request. | [M54] |
| **M57** | [Attempt Correlation](../../.milestones/MILESTONE-57-attempt-correlation/MILESTONE.md) | todo: Claims leave durable generation receipts and workers can optionally associate notes, usage and artifacts with the correct claim after release. | [M46, M54] |
| **M58** | [Operational Views](../../.milestones/MILESTONE-58-operational-views/MILESTONE.md) | todo: Task and report filters survive reload and browser history, and people can reopen named tenant-safe personal or explicitly shared query definitions. | [M53] |

M21–M29 are sequenced by explicit user priority (like M13 before M10) and
carry no dependency edge; every numbered milestone before M29 is done. M29
differs only in how it was chosen: by an 8-advisor council over 16 candidates
(`.milestones/council/COUNCIL-0001-2026-08-24T09-00-18.md`), not by intuition.

## Sequencing rationale

**M01 and M02 come first and are cheap.** Nothing later can be trusted while
CI does not run the GUI suite and the specifications describe libraries that
are not installed — every agent session reads those documents as ground truth.

**M03 before M04 before M10.** All three extend the same authorization surface.
Making the current model correct (M03) gives a known-good baseline to add agent
principals to (M04), and only then is it safe to replace the whole model with
policy evaluation (M10).

**M05 before M06 and M07.** Make the screens feature-complete before making
them coherent and fast; doing it in the other order means reworking components
that are about to change.

**M08 and M09 both wait on M07.** Real-time multiplies read traffic, and the
portable binary should not ship a weaker search than the clustered deployment.

**M12 is last** because it certifies everything else, and closing the
client–server test gap is cheapest once the contract has stopped moving.

**M13 leads M10 by product priority, not by a technical dependency.** Both are
IAM-surface work and both are unblocked by M03 alone. M13 redefines what a
`users` row is (a local identity that may or may not have an email, may or may
not be linked to Google); M10 redefines how access is granted on top of
whatever a `users` row is. Building M10's teams/grants model after M13 means
it is designed against a user model that already tolerates no-email accounts,
rather than assuming — as the current member picker and invitation flow do —
that every member has an email.

**M14 leads M08 by product priority, not by a technical dependency.** Both are
unblocked once their `depends_on` lists are satisfied (M14: M04, M05 — both
done). M14 fixes correctness defects in the task write path that is already
live, and closes the gap between the product's stated goal — usable by
autonomous agents — and what the API actually allows an agent principal to
do (claim work, retry safely). That gap is judged higher priority than adding
a new capability (M08's real-time/audit surface), so M14 goes first; nothing
in M08's scope depends on M14 or vice versa.

## Parallelism

Milestones with no dependency edge between them may run on separate branches.
M02 is deliberately unblocking and can run alongside anything. After M01, the
M03→M04 chain and the M05→{M06, M07} chain are independent.

## Review delivery sequence — 2026-11-09

The detailed acceptance and recommendation mapping is in
[the delivery plan](../../.milestones/DELIVERY-PLAN-2026-11-09.md).
M44, M45, M51 and M52 are already published on main as `579860f`.
M46–M48 establish reliable delivery/recovery; M53 repairs existing user flows.
M54 supplies evidence, M55 a source-truth attention surface, M56 guided external
connection, M57 optional claim receipts, and M58 shareable query intent.
M49 measures the delivered reliability behavior; M50 reconciles operational
claims and runbooks. Individual feature milestones own their own documentation.
Statuses above are the planning snapshot; the milestone ledger remains current.
