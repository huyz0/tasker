# Proactive Alerting for Stalled Claims — Shaping Notes

## Scope

A background email alert when an agent-claimed task goes stalled (M24's
own detection: silent past a threshold), so a responsible human learns
about it without opening `/reports`. Closes the specific gap named in a
Linear/Monday comparison: both competitors lean into contextual, proactive
alerting; Tasker's Reports screen was pull-only.

Backend-only milestone (5 tasks) — no contract/RPC/GUI/CLI interface
change, though the real footprint (two schema files, a migration, a
detector extraction crossing a dialect-convention boundary, an email
template, a sweep) is stated honestly rather than undersold, per the
review that shaped this design.

## Design process

Drafted from the M24 substrate (`task_activity`, the `stalledClaims` panel
logic in `reports/exceptions.ts`, the existing `mailer.ts`/`inviteEmail.ts`
pattern, and the one existing precedent for periodic work,
`retentionSweep.ts`'s `setInterval`), then reviewed once by a dedicated
subagent that verified every factual claim against the code and judged the
scope/recipient decisions before planning. The review corrected the draft
materially rather than rubber-stamping it — full verdict preserved in
[references.md](references.md).

## Decisions

- **Email only, not an in-app bell — but the domain event is published
  anyway.** The draft deferred the event too, on the theory that a
  background job stamping `orgId`/`actor` onto a domain event was
  unprecedented and risky. The review found this overstated:
  `publishDomainEvent` takes `nc` as a plain argument, and the correlation
  Proxy only fills in `orgId`/`actor` when a payload *omits* them — a
  payload that already names its org, which is what a background job with
  no ambient request context must supply, is the documented, intended
  case; `orgs.handler.ts` already publishes several events with an
  explicit `orgId` this way. M08's own "swallowed event" bug was the
  *opposite* mistake: a payload with no org relying on stamping that
  couldn't happen. So `domain.task.stalled` is published per alert, at
  negligible cost, with the claimed agent carried as `stalledAgentId` (not
  `agentId` — the audit projector's actor-extraction checks `agentId`
  first, and a payload literally named that would misattribute the event
  to the agent instead of `'system'`, the reserved convention
  `taskActivity.ts` already established for exactly this non-request
  case) — giving a future GUI notification surface a subject already
  flowing. The surface itself (a bell, read/unread state, a new component)
  is real, separate frontend work and stays out of scope here.
- **The detector is extracted to `lib/`, not left in `modules/reports/`.**
  `reports/exceptions.ts` imports `schema.sqlite` unconditionally — valid
  only because the reports module never runs outside a request. A
  background job is exactly the case that shortcut doesn't cover, so the
  shared `findStalledCandidates` lives in `lib/` using the same
  `STANDALONE === 'true'` dialect branch every other `lib/` module uses,
  parameterized by optional `projectId` (omitted = global, what the sweep
  needs at real scale), `limit` (the report's `PANEL_LIMIT` must not
  silently cap what the alerter even considers), and `afterHours`.
- **The global query needed a fix the per-project one didn't.** Running
  the per-project query's `inArray(taskActivity.taskId, heldIds)` pattern
  without a project filter reintroduces exactly the class of bug M24-T06
  already found once, on the sibling `unclaimed` query — a driver-side
  IN-list sized by however many tasks are held, unbounded at global scope.
  That query's own fix was a project-scoped grouped aggregate, which
  doesn't transfer directly (there is no single project to scope by); the
  global path needs its own shape doing the same job — a join from
  `task_assignments` (agent-held tasks) into a `GROUP BY task_id` aggregate
  over `task_activity`, so "which tasks are held" and "last signal per
  task" resolve in one indexed pass rather than two steps joined by a
  materialized id list.
- **Recipient chain collapsed from three tiers to two.** The draft chained
  `task_reviewers` → human commenters on the task → org-owner fallback.
  Rejected the middle tier: `task_notes` are hardcoded agent-authored
  (only `comments` can carry a human actor, so the tier was already
  half-dead), and more fundamentally, **commenting on a task is itself a
  signal that clears the stalled condition** — the act that would enroll
  someone in future alerts is the act that resolves the current one, a
  self-defeating population. Shipped chain: `task_reviewers`, falling back
  to the org's `owner`/`admin` members (this codebase's own existing
  notion of "org-level responsible party", `ADMIN_ROLES`) only when the
  task has no reviewers. Every email states which tier fired — the
  nearest thing to an unsubscribe affordance this version has, and what
  keeps "who gets this" answerable without reading source.
- **The dedup table's key had a NULL bug, now fixed.** `anchor_at`
  (claimed/assigned anchor) is `NULL` for any claim predating activity
  collection — and both SQLite and MySQL treat NULLs in a unique index as
  mutually distinct, a gotcha this codebase has already hit once
  (`folders_project_id_parent_id_name_idx`'s own comment names it). Left
  nullable, the dedup table would have deduped nothing for exactly the
  oldest, most legacy claims — re-emailing them every sweep forever.
  Fixed: `anchor_at` is `NOT NULL`, computed as `maxDate(claimed, assigned)
  ?? task.createdAt` — narrower than, and deliberately different from, the
  detector's own `silentSince` (which also folds in the most recent
  signal). Keying dedup on `silentSince` would move the key every time any
  signal lands, re-alerting a claim that is still genuinely stalled on its
  very next sweep.
- **The sweep sends a digest per recipient, not one email per task — the
  single fix that makes this shippable at all.** The draft's per-task
  loop would, on the very first run against any existing deployment, email
  every stalled claim accumulated over the system's whole history all at
  once per recipient — the most likely way this feature gets permanently
  disabled on day one. Fixed: candidates are grouped by resolved
  recipient; one digest per recipient per sweep, itemized up to a cap with
  "+N more" for overflow; `stalled_claim_alerts` rows are written only for
  tasks actually itemized in a sent digest, so overflow gets a chance to
  be itemized in a later sweep rather than being silently marked alerted
  while never named in any email a human reads.
- **Threshold is configurable; cadence is not.** `STALLED_ALERT_AFTER_HOURS`
  is a separate env var from the report panel's own `STALLED_AFTER_HOURS`
  (defaulting to it) — being 24h "wrong" in a report is a slightly noisy
  panel; being 24h "wrong" in an unsolicited email trains people to filter
  the sender, and only the operator running a given fleet's actual cadence
  can judge the right number. The sweep's hourly interval stays hardcoded,
  matching `RETENTION_SWEEP_INTERVAL_MS`'s own precedent: policy is
  configurable, mechanism is not. `!mailer.enabled` short-circuits before
  any query runs, so the common no-SMTP deployment pays nothing.
- **Growth of the dedup table is accepted, not solved.** One tiny row per
  alert, alerts are infrequent by construction — pruning is named as
  deferred rather than built. An in-memory set was considered and
  rejected: the standalone binary and dev deployments restart routinely,
  and a reset in-memory set would re-flood on every restart, which is
  worse than the table.

## Deliberately not built (recorded, with owners)

- GUI notification/bell surface — the event now flows; the surface is
  separate frontend work (new component, read/unread state, an
  `eventQueryKeys` mapping). Future milestone.
- Per-user notification preferences beyond the "why you got this" line.
- Project "watchers" as a first-class concept.
- An `agents` owner/operator column — would materially improve recipient
  resolution (there is currently no way to notify "whoever runs this
  agent" specifically); named for a future milestone, not guessed around.
- Slack/webhook delivery channels.
- Pruning `stalled_claim_alerts` (growth accepted as small).

## Context

- **Visuals:** none — no GUI surface in this milestone.
- **Milestone:** `.milestones/MILESTONE-25-stalled-claim-alerting/`
- **ADR:** ADR-0022 (recipient resolution, digest design, dedup table,
  publishing the event)
