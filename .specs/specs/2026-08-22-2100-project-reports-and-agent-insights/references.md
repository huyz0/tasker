# References — the three design reviews that shaped M24

The v1 draft proposed: two tabs (Flow / Agents); charts — CFD (statuses
merged by name), created vs completed, cycle-time percentiles, aging-WIP
scatter, agent-vs-human stacked throughput, agent leaderboard sorted by
completions, handoffs-per-day + churn list, claim-latency percentile trend.
Three independent subagent reviews were run against it before planning.
Their verdicts, preserved because the reasoning is the durable part:

## 1. Product-value review (manager-on-the-loop lens)

Core finding: **AI agents don't degrade the way human teams do.** A human
team gets gradually slower and percentile trends catch that. An agent fleet
either works or it is stuck, looping, or marking things done that aren't —
a discrete, fast failure mode, so **exception lists beat trend charts** far
more than they do in Jira. The draft shipped four trend charts and two
exception surfaces, buried at positions 4 and 7.

Per-chart verdicts:

- **CFD** — CHANGE: keep (one of the two Jira reports that genuinely get
  used), but scope to one task type via selector; merge-by-name makes band
  thickness change when a type is added — "will be looked at and misread,
  which is worse than rot". Marginal value over the live Kanban board is
  slope only.
- **Created vs Completed** — KEEP, the strongest item; make the cumulative
  gap the primary read (daily bars at 5 tasks/day are noise). Flagged a
  shipping bug in waiting: `created` is retroactive, `completed` accrues
  from deploy — unclipped, day one draws a full created line against an
  empty completed line and reads as "the fleet stopped working". Clip to
  collection start.
- **Cycle-time percentiles** — CUT: "the clearest rationalization in the
  document" — there is no slow class to slice (no priority/size/points),
  weeks of sparse data before readable, and the direct analogue of Jira's
  control chart, the canonical rotted report. Aging WIP is the actionable
  form of the same information.
- **Aging WIP** — KEEP but promote to first position and change form:
  a ranked "work that has stalled" table (what the manager does is click
  the outlier), not a scatter. Ships before `task_activity` via
  days-since-any-signal, which for agent work is the better metric anyway.
- **Agent-vs-human throughput chart** — CHANGE to one header stat with
  prior-window comparison; it's a quarterly question, a chart would rot.
- **Leaderboard** — re-pivot from "who's winning" (vanity; an agent closing
  40 trivial tasks isn't outperforming one grinding a hard one) to "who
  needs looking at": sort by problem, exception columns.
- **Handoffs/day** — CUT (no threshold anyone knows); churn list KEEP —
  "the best agent-native idea in the proposal", sibling of the
  status/PR-disagreement panel: work that looks active without progressing.
- **Claim-latency trend** — CUT; the actionable form is the current
  oldest-unclaimed queue, not a percentile.

Missing and added: **status regressions ("work that went backwards")** —
the agent-native reopened-bug signal, "the strongest chart in the design
and it's not in the document"; free from `task_activity`'s terminality
flags. Also named: `task_reviewers` outcome + review-queue latency as the
highest-value adjacent work ("worth more than charts 3, 5, 7a and 8
combined"), deferred as its own design round.

Structural: one page, no tabs (tabs hide the second tab from a twice-a-day
visitor; urgency ordering is the design); no invented backfill (a day-0
flat CFD band "is a stronger lie than an empty chart"); lead the release
with the cards computable from existing data. Dashboard cross-link
one-directional, no charts or counts there. Predicted daily-visited
surfaces: the stalled-work table and the churn list — "note that neither
is a chart".

## 2. Agents-dimension review (fleet-operator lens)

Two code facts that reframed the surface:

- **An agent cannot release its own claim** (`unassignTask`/`assignTask`
  are `requireUser`; only `claimTask` accepts agents) — so every crashed or
  wandered-off claim waits for a human, a standing work queue the product
  surfaces nowhere. Hence: stalled-claims list with a per-row **Unassign**
  action — "converts the Reports screen from a dashboard into an
  intervention surface".
- **Agent-created tasks are unattributable** (`tasks.createdBy` is
  users-only; agents write NULL) — `task_activity.actor_type` on `created`
  rows fixes this for free.

The draft's Agents tab "measures volume, not trust — for an operator
running 10–100 agents, volume is the vanity half." Added: **stalled claims**
(split "never started" vs "went quiet" — broken runner vs hard task —
cross-tabbed with `api_tokens.lastUsedAt` liveness for a diagnosis, not an
alarm), **reopen rate** (Tasker has no measure of agent output quality at
all today), **agent⇄role grouping** (the role is the configurable unit —
"agent bot-47 has a 30% reopen rate is an anecdote; every agent on the
Implementer role has a 30% reopen rate is a prompt change"), **autonomy
rate** (% of completions with zero human write — "the north-star metric";
also the honest version of agent-vs-human attribution, which by
actor-at-completion books the completion to whichever human clicked Done).

Schema demands (all adopted into ADR-0020, ranked by "expensive later"):
assignee-at-event columns (assignment history is otherwise
unreconstructible — attribution, reopen-blame and held-task cycle time all
need holder-at-event); terminality stamped at write (mutable status config
must not rewrite history); note/comment/handoff kinds in the activity
table (the #1 panel's last-signal query becomes one index scan instead of
a 3-way UNION); index `(project_id, kind, occurred_at)`; do NOT
denormalize `agent_role_id` (re-roling re-attributes history — accepted,
recorded); never a `claim_rejected` kind (polling fleets would make it the
largest table — telemetry counter territory). Landmines: purge cascades
must delete activity rows explicitly (no FK cascades exist in this
codebase); purged agents leave dangling `actor_id` — render "(deleted
agent)"; the claim activity insert belongs inside `withIdempotency`'s
callback so replays can't double-count.

## 3. Technical-feasibility review (verified against the code)

Ground-truth audit of the draft: no errors found in its data-model claims.
Twelve REQUIRED corrections, all adopted:

1. `updateTask` never touches status — `updateTaskStatus` is the single
   status choke point (insert after its `affected` CAS check).
2. `archived`/`restored` kinds are REQUIRED — without them the CFD counts
   soft-deleted tasks in their last status forever.
3. Backfill must carry the task's **current** status (the draft's
   "initial status" would show every pre-existing done task as todo
   forever).
4. Explicit `task_activity` deletes in `purgeTask`, `purgeTaskCascade`,
   `purgeProjectCascade` — there are no FK cascades anywhere in this
   codebase; the retention sweep reuses those functions.
5. "Transaction-consistent" was false — handlers are non-transactional;
   state the accepted drift honestly (ADR-0020).
6. `unassignTask` is unconditionally idempotent today — it must capture
   affected rows before writing an `unassigned` event.
7. CFD algorithm: one SQL daily-delta pass (+1 `to_status` / −1
   `from_status`, GROUP BY day+status) over full history + JS prefix-sum —
   per-day GROUP BY of raw events is insufficient (events are deltas, not
   states); per-task JS reconstruction is unnecessary and the slow path.
8. Percentiles can't be portable SQL (SQLite has none) — SQL returns
   per-task duration rows, JS computes; aging-WIP-style lists must be
   server-capped top-N.
9. `scripts/seed.ts` bypasses handlers — it must seed `task_activity` or
   `measure:latency` numbers for the report RPCs are fiction; both RPCs
   need named rows in `api-standard.md` §6 (not `list*`, no inherited
   default).
10. Two RPCs, not three.
11. Gate registrations belong in the task list: `agent-scope-sweep.test.ts`
    (hand-assembled handler map — an unlisted handler is silently
    unswept), `viewer-denial.test.ts`, `eventQueryKeys.ts` + test,
    `query-error-coverage`, `indexCoverage.test.ts` HOT_QUERIES; SQLite
    timestamp columns store **seconds** — `strftime` needs `'unixepoch'`,
    and equal-second events need an id tiebreak.
12. ADR numbering: next free is ADR-0020.

Chart-kit verdict: hand-rolled SVG is correct and the repo's own history
argues it (ADR-0005 hand-rolled primitives; ADR-0011 admits Radix only for
genuinely-hard focus/overlay problems — charts are deterministic
rendering). Recharts' `ResponsiveContainer` measures 0×0 in jsdom, fighting
the hard 95% coverage gate; `mobile-overflow.mjs` explicitly exempts
deliberate `overflow-x-auto` scrollers; design-lint bans raw hex and
`fill-`/`stroke-` palette utilities, so `--chart-*` tokens are mandatory;
the contrast gate only auto-checks `*-foreground` pairs, so whether chart
tokens get them is a deliberate decision (they don't — they never carry
text; ADR-0021).
