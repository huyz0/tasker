# References — the review that shaped M25

The draft proposed: defer both the email and the in-app event (the whole
proactive channel gated on "background jobs can't safely publish domain
events"); a three-tier recipient chain (reviewers → human commenters → org
owners); a dedup table keyed on a possibly-null anchor; one email per
stalled task per sweep; a hardcoded threshold shared with the report
panel. One dedicated review verified every factual claim against the code
before planning. Its verdict, preserved because the reasoning is the
durable part:

## Confirmed facts (the draft's grounding was accurate)

`retentionSweep.ts` never touches NATS, only logs — confirmed the one
precedent for periodic work is log-based. Background jobs genuinely have
no ambient request context (`getRequestContext()` returns `undefined`
outside `runWithRequestContext`). M08's "swallowed event" history is real
(`eventScope.ts` drops any event with no `orgId`). The `stalledClaims`
detection logic, `STALLED_AFTER_HOURS`, the anchor/silentSince computation,
`agents` having no owner/operator column, `task_reviewers`/
`organization_members`/`grants` shapes, `mailer.ts`/`inviteEmail.ts`'s
pure-template convention, and the absence of FK cascades anywhere in this
codebase — all confirmed exactly as drafted.

## Disputed facts — where the draft was wrong

**The background-event-publishing risk was overstated.** `publishDomainEvent`
takes `nc` as a plain argument; the request-context Proxy only fills in
`orgId`/`actor` *when absent*, and its own comment says a payload that
already names its org is the correct, intended case. `orgs.handler.ts`
already publishes several events with an explicit `orgId` this way — live
precedent for the *pattern*, though those specific call sites do run under
a request (there is no existing precedent for publishing from *outside*
one, which this sweep will be the first of). `modules/tasks/
taskActivity.ts` already reserves `actorType: 'system'` for exactly this
non-request situation, and `consumers/auditProjector.ts` already falls
back to it *when a payload carries no `agentId`* — a detail that turned
out to matter (see the payload-naming fix below). M08's actual bug was the
*opposite* mistake — no org, relying on stamping that couldn't happen.
Supplying `orgId` explicitly is the fix M08 shipped, not a rerun of the
bug. Verdict: publish the event; the deferred piece is the GUI surface
that would consume it, which is genuinely separate work.

**Found during the docs review itself, before any code existed: the
payload's agent field would have defeated the whole point of Decision 4.**
`extractActor` checks `payload.agentId` *before* its `'system'` fallback —
so a payload literally named `agentId` records the event as
`actorType: 'agent'` in `audit_log`, not `'system'`, silently contradicting
the exit criterion that depends on it. Fixed by naming the field
`stalledAgentId` instead, which the projector's existing logic doesn't
special-case, so its no-agentId fallback correctly resolves `'system'`.

**The dedup key has a NULL hole that defeats its entire purpose.**
`anchor_at` (the claimed/assigned anchor alone) is `undefined` for any
claim predating activity collection. Both SQLite and MySQL treat NULLs in
a unique index as mutually distinct — a gotcha this codebase has already
documented once, on `folders_project_id_parent_id_name_idx`. Left
nullable, the unique constraint dedups nothing, emailing the oldest legacy
claims every hour forever. Fix: `anchor_at` NOT NULL, falling back to
`task.createdAt` when neither `claimed` nor `assigned` exists — but
**not** the detector's own `silentSince`, which is a wider chain
(`lastSignalAt ?? claimedAt ?? task.createdAt`) that also folds in the
most recent signal. Keying dedup on `silentSince` instead would move the
key every time any signal lands on the task, re-alerting a claim that is
still genuinely stalled on its very next sweep — the opposite of what
dedup exists to do.

**The "commenter" recipient tier can barely ever fire, and is
self-defeating when it does.** `task_notes` are hardcoded
`actorType: 'agent'` — a task note is the agent's own record of its work,
by explicit design. Only `comments` can carry a human actor, so the
tier's population is already narrower than drafted. More importantly:
commenting on a task is itself a signal that clears the stalled condition
— the tier's population, by the act that enrolls them, has typically just
removed the reason for the alert. Verdict: drop it. Two tiers
(`task_reviewers`, falling back to org `owner`/`admin`) is both simpler to
reason about and avoids the self-defeating population.

**Running the per-project query globally reintroduces a fixed, recent
bug.** The per-project `stalledClaims` query's `inArray(taskActivity.
taskId, heldIds)` over held task ids is bounded per project; at global
scope it becomes an unbounded driver-side IN-list, the exact class of
problem M24-T06 already found and rewrote once, on the sibling
`unclaimed` query (named in that file's own comment) — though that fix
itself was a project-scoped grouped aggregate, which doesn't transfer
directly to a query with no project to scope by. The design's "2,000
projects" framing is precisely the scale under which the naive version
breaks. Fix: the global path needs its own aggregate shape doing the same
job — a join from `task_assignments` into a `GROUP BY task_id` aggregate
over `task_activity`, resolving "held" and "last signal" in one indexed
pass rather than a materialized id list feeding a second query.

**The first-run flood is the single most important miss.** On its first
run against any existing deployment, a per-task-email design sends one
email per stalled claim accumulated over the system's *entire history*,
all at once, to whoever the fallback resolves to. Nothing in the draft
named this. It is the single most likely way this feature gets disabled
permanently on day one. Fix: a digest — one email per recipient per
sweep, itemized up to a cap, "+N more" for overflow, with dedup rows
written only for what was actually itemized (so overflow gets a real
chance to appear in a later digest rather than silently vanishing).

**The threshold should be independently configurable; the interval
should not.** 24h "wrong" in a pull report is a slightly noisy panel;
24h "wrong" in a push email trains people to filter the sender — a
materially different blast radius that only the operator running a given
fleet can judge. `STALLED_ALERT_AFTER_HOURS` as its own env var (defaulting
to the report's own threshold) resolves this; the sweep's hourly interval
stays hardcoded, matching `RETENTION_SWEEP_INTERVAL_MS`'s own precedent —
policy configurable, mechanism not. Also flagged and adopted: an explicit
`!mailer.enabled` early exit before any query runs, since every no-SMTP
deployment (the common case) would otherwise pay for a global scan whose
result is discarded.

## Other findings adopted without dispute

The dedup table is correct as a design (rejected: an in-memory set, which
would reset — and re-flood — on every restart of a standalone binary that
restarts routinely; rejected: a column on `task_activity`, which would be
actively dangerous — a synthetic "alerted" row would be picked up by the
detector's own last-signal query, since it excludes only `created`,
creating a feedback loop where alerting on a task un-stalls it). Growth of
the dedup table is accepted as unbounded-but-small rather than solved.
Deleted/archived agents should render "(deleted agent)" in the email
rather than crash, matching the report card's own fallback. The email's
suggested action is Unassign/reassign, not "reply" — a reply-as-comment
would itself clear the condition without the agent having done anything,
which is the wrong signal to invite. Neither `setInterval` block in this
process fires at boot; the new one matches that, accepting a
restart resets the alert clock by up to an hour as harmless at this
cadence. The milestone's real footprint (two schema files, a migration, a
regenerated embedded-migrations file, two cascade edits, a detector
extraction crossing a dialect-convention boundary) is stated honestly in
the final design rather than undersold as "schema + backend module."
