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
browser — not merely present in the source. Where that verification found the
feature broken, the finding is recorded in the milestone's `PROGRESS.md` rather
than quietly fixed.

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
| Invite users by email | Invite surface delivered (create, list, revoke, expiry). **Email delivery is still not implemented** — no SMTP integration exists, and this is the one Phase 1 line not fully closed | M03 |
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
