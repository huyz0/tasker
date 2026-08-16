# Product Roadmap

Delivery is organised into **milestones** — each one a verifiable end state for
the product, not a bucket of activities. The plan, the task breakdown and the
committed progress for each live in `.milestones/`; the format is governed by
`.specs/standards/milestone-standard.md`.

Current delivery state: **`.milestones/STATE.md`** — read that first.
Report on it any time with `/milestone-status`.

---

## Phase 1: MVP — status

The original MVP scope, with the milestone that owns each remaining gap.

| Capability | State | Owner |
|---|---|---|
| Core API, CLI, agent skills | Delivered | — |
| Real-time GUI | Not built — no subscription of any kind | M08 |
| Single-bundle portable packaging with embedded DB and search | Not built — the standalone binary serves a placeholder page | M09 |
| Organizations & users, admin / non-admin roles | Delivered | — |
| Teams | Not modelled | M10 |
| Google login | Delivered | — |
| Local username/password accounts, no email required | Not modelled — every user is a Google identity today | M13 |
| Linking/unlinking an external identity to an existing account | Not modelled | M13 |
| Invite users by email | Record created; never sent, no UI, no expiry or revocation | M03 invite surface, M11 delivery |
| Hierarchical organization structure | Delivered, capped at two levels, no inheritance | M10 |
| Task types and status enums | Delivered | — |
| Task state machines | Enforced by the API; not configurable from the GUI | M05 |
| Project templates with root task type | Delivered | — |
| Projects from templates, owner assignment | Delivered | — |
| Agent roles and configuration | Delivered; globally shared across tenants, and not creatable from the GUI | M03 |
| Agent instances | Delivered as records; agents have no identity or credential | M04 |
| Tasks with human-readable ids, status, description, comments, labels | Delivered | — |
| Task ↔ agent / human relationships (created by, assigned to, reviewers) | API and CLI only; unreachable from the GUI | M05 |
| Artifacts in nested folders | API and CLI complete; GUI has no upload and renders folders flat | M05 |
| Task-to-artifact links | API and CLI only | M05 |
| Task comments and AI task notes | Delivered | — |
| Markdown throughout | Delivered | — |
| Artifact commenting | Supported by the API; not mounted in the GUI | M05 |
| List, search, sort, filter, page across core entities | Backend complete; the GUI sends none of these parameters | M05, M07 |

## Phase 2: Post-launch — status

| Capability | State | Owner |
|---|---|---|
| GitHub / Bitbucket repositories, read-only | Delivered | — |
| Project ↔ repository links | Delivered | — |
| Tasks displayed with linked pull requests | Delivered | — |
| Build and deployment tracking | Live pass-through implemented; surfaced only in the project repository panel | M05 |
| Universal search | Delivered — M01 made every shown result resolve to a real route, filtering out those that cannot. Still a `LIKE` scan with no index | M07 |

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

## Parallelism

Milestones with no dependency edge between them may run on separate branches.
M02 is deliberately unblocking and can run alongside anything. After M01, the
M03→M04 chain and the M05→{M06, M07} chain are independent.
