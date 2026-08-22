---
id: ADR-0022
status: accepted
date: 2026-08-23
milestone: M25
---

# Stalled-claim alerting: digest email, two-tier recipients, dedup by claim anchor

## Context

M24's `/reports` detects a stalled claim (an agent-held task gone silent
past a threshold) but only shows it to a human who opens the screen — pull
only. This milestone makes it proactive: a background sweep that emails
the humans responsible for a newly-stalled task. Five real decisions had
alternatives worth recording, each corrected once by a dedicated review
before any code was written (the review's full verdict is in the spec
folder's `references.md`).

## Decision 1 — Recipients: `task_reviewers`, falling back to org owner/admin

**Options considered**: (a) every org owner, always; (b) whoever holds an
admin-level grant on the project (reverse-resolving `can()`); (c) the
task's reviewers, falling back to org owners/admins; (d) (c) plus a third
tier of humans who have commented on the task.

(a) is noise at the product's own stated scale (2,000 projects total) — an
org-wide broadcast for a single project's stalled task. (b) requires
reverse-resolving a forward-only permission check into "every subject that
would pass" — real, unbuilt machinery, disproportionate to this feature.
(d) was drafted and rejected: `task_notes` are hardcoded agent-authored by
design (a note is the agent's own work record), so only `comments` could
ever populate that tier — already half-dead — and more fundamentally,
commenting on a task is itself a signal that clears the stalled condition,
so the tier's population is self-defeating by construction.

**Decision**: (c). `task_reviewers` for the task; falling back, only when
none exist, to the org's `owner`/`admin` members. Filtered to non-null
email (M13's local accounts; the same bail-out `sendInviteEmail` already
uses). Every email states which tier fired.

**Consequences**: predictable and reasoned about without reading source
("you're a reviewer" / "you're an owner"); scales per-task rather than
per-org; the fallback tier is isolated in one function, so if it proves
too broad or narrow in practice, it's the one lever to adjust. Foreclosed
for now: no way to notify "whoever runs this agent" specifically, since
`agents` carries no owner/operator column — named as a gap for a future
milestone rather than guessed around.

## Decision 2 — Delivery: one digest per recipient per sweep, not one email per task

**Options considered**: (a) one email per stalled task, sent immediately
on detection; (b) one digest email per recipient per sweep, itemizing
every task they're newly responsible for.

(a) was the draft. Its failure mode is severe and specific: the first
sweep run against *any* existing deployment emails every stalled claim
accumulated over the system's entire history, at once, per recipient —
independently identified as the single most likely way this feature gets
permanently disabled on day one.

**Decision**: (b). Candidates are grouped by resolved recipient; each
recipient gets one email listing up to `DIGEST_TASK_LIMIT` (20) itemized
tasks with "+N more" for overflow. The dedup table
(`stalled_claim_alerts`) only records a task as alerted once it is
actually itemized in a sent digest — overflow is left eligible for a later
sweep rather than being marked alerted while never named in any email a
human reads.

**Consequences**: the worst case becomes one email per recipient instead
of N; a chronically-overflowing recipient keeps seeing new items rotate
in as earlier ones resolve or get acted on, rather than some silently
never surfacing. Slightly more assembly code than the per-task loop it
replaced, in exchange for the feature being safe to enable at all on an
existing deployment.

## Decision 3 — Dedup: a new table, keyed on task + claim anchor, anchor NOT NULL

**Options considered**: (a) an in-memory set inside the running process;
(b) a column added to `task_activity`; (c) a dedicated table keyed on
`(task_id, anchor_at)`.

(a) resets on every restart — and the standalone binary and dev
deployments restart routinely — so it would re-flood on every restart,
worse than doing nothing. (b) is actively dangerous: `task_activity`'s own
last-signal query excludes only the `created` kind, so a synthetic
"alerted" row would itself be read as a fresh signal by the detector,
un-stalling the very task it was recording an alert for — a feedback loop,
and a violation of ADR-0020's own separation between "what a mutation
handler recorded" and "what a background job noted."

**Decision**: (c), with one fix the draft got wrong: `anchor_at` must be
`NOT NULL`, computed as `maxDate(claimed, assigned) ?? task.createdAt` —
**not** the detector's `silentSince`, which is a different, wider chain
(`lastSignalAt ?? claimedAt ?? task.createdAt`) that also incorporates the
most recent signal. Keying dedup on `silentSince` would move the key every
time *any* signal lands on the task, re-alerting a still-genuinely-stalled
claim on its very next sweep — the opposite of what dedup is for. Keying
on the narrower claimed/assigned anchor (falling back to `createdAt` only
when neither exists — the case a claim predating activity collection
hits) is what makes a fresh claim, and only a fresh claim, eligible again.
Left nullable, it would have failed silently in a different way: SQLite
and MySQL both treat NULLs in a unique index as mutually distinct from
each other — this codebase has already hit that exact gotcha once
(`folders_project_id_parent_id_name_idx`) — so every claim predating
activity collection would never dedupe, re-emailed on every sweep forever.

**Consequences**: growth is accepted as unbounded-but-small (one tiny row
per alert, alerts are infrequent by construction) rather than solved with
a pruning job — a deliberate, stated trade, not a silent gap. Explicit
deletes are added to `purgeTaskCascade`/`purgeProjectCascade`, since no FK
cascades exist anywhere in this codebase.

## Decision 4 — Publish the domain event now, defer only the GUI surface

**Options considered**: (a) email only, defer the domain event too,
reasoning that a background job stamping `orgId`/`actor` onto a domain
event was unprecedented; (b) publish `domain.task.stalled` per alert, with
an explicit `orgId`, alongside the email.

(a) was the draft's reasoning, and the review found it factually wrong:
`publishDomainEvent` takes `nc` as a plain argument; the request-context
Proxy that stamps `orgId`/`actor` only fills them in *when a payload omits
them*, and its own comment states that a payload naming its org already is
the correct, intended case — `orgs.handler.ts` already publishes several
events exactly this way with no request in flight. M08's actual
"swallowed event" bug was the opposite mistake: a payload with *no* org,
relying on stamping that never happened because no request existed.
Supplying `orgId` explicitly, as this sweep does, is the fix M08 already
shipped for that class of bug — not a rerun of it.

**Decision**: (b). Publish `domain.task.stalled` per alerted task, with an
explicit `orgId`, which the correlation Proxy leaves untouched precisely
because it only fills in fields a payload omits.

**Payload field naming, found during the docs review and fixed before any
code exists**: the claimed agent must travel as `stalledAgentId`, **not**
`agentId`. `consumers/auditProjector.ts`'s `extractActor` checks
`payload.agentId` *before* falling back to `'system'` — a payload literally
named `agentId` would be recorded in `audit_log` as `actorType: 'agent'`,
silently defeating the entire point of this decision (the sweep, not the
agent, is who did something here — the agent is data the event is *about*,
not its actor). `stalledAgentId` sidesteps that branch entirely, so the
projector's existing no-agentId fallback correctly resolves
`actorType: 'system'`.

**Consequences**: negligible added cost; the event lands in `audit_log` for
free (correctly attributed to `'system'`, given the field-naming fix
above), and a future GUI notification surface starts from a subject
already flowing rather than from nothing. What remains genuinely out of
scope is the GUI surface itself — a bell, read/unread state, an
`eventQueryKeys` mapping — real, separate frontend work.

## Decision 5 — Threshold is configurable; sweep cadence is not

**Options considered**: (a) reuse the report panel's `STALLED_AFTER_HOURS`
directly for the email trigger too; (b) a separate, independently
configurable `STALLED_ALERT_AFTER_HOURS` env var, defaulting to (a)'s
value; (c) make the sweep's interval configurable as well.

(a) conflates two triggers with materially different blast radii: 24h
"wrong" in a pull report is a slightly noisy panel a human can shrug off;
24h "wrong" in an unsolicited email trains a person to filter the sender,
and only the operator running a given fleet's actual cadence can judge the
right number for their case — the report's default is not necessarily the
right email default for every deployment. (c) was considered and rejected:
the interval is a mechanism detail (how often the system *checks*), not a
policy a deployment has a legitimate reason to tune, and `RETENTION_SWEEP_
INTERVAL_MS`'s own precedent already treats its interval as hardcoded for
exactly that reason.

**Decision**: (b). `STALLED_ALERT_AFTER_HOURS`, its own env var, defaulting
to `STALLED_AFTER_HOURS`. The sweep's hourly interval stays hardcoded.
`!mailer.enabled` short-circuits the sweep before any query runs, so the
common no-SMTP deployment pays nothing for a scan whose result would be
discarded anyway.

**Consequences**: a deployment can tune when it gets emailed without
touching when its report panel considers something stalled, at the cost
of one more env var to document. Foreclosed: the sweep's own cadence is
not a per-deployment knob — changing it requires a code change, which is
the intended bar for touching a mechanism rather than a policy.
