---
active_milestone: M14
active_task: M14-T07
last_updated: 2026-08-17
last_commit: 4eec950
blocked: false
blocker: null
---

# Delivery State

> **Read this file first.** It is the single entry point for any agent or human
> resuming delivery. It is committed to git, so the state of the work travels
> with the repository and survives the end of any session.

## Now

**2026-08-17 — M14 (Task Reliability & Agent Self-Service) planned and
inserted ahead of M08, by explicit product direction.**

A deep review of task type/state/editing (UI, UX, API, implementation, test
depth), a competitive usability read against Linear/Jira/Trello/Monday, and a
dedicated pass on the agent-facing surface together found three live defects
in the task edit/status/archive paths and, more fundamentally, that the
product's own stated goal — usable by autonomous AI agents, not just humans —
is not yet met: agents cannot claim their own work, there is no atomic claim
primitive, and no mutating task RPC is retry-safe. Full plan and rationale:
`.milestones/MILESTONE-14-task-reliability-and-agent-self-service/MILESTONE.md`.

M14 has no `depends_on` edge to M08 — both are unblocked and independent —
but leads it by priority for the same reason M13 led M10: it fixes the
active task-management surface rather than adding a new one, and the
agent-self-service half is this project's namesake capability.

**2026-08-17 — M10 (Teams & Policy-Based RBAC) closed: 13/13 tasks, every
exit criterion in the milestone's own §6 verification checklist met.**
Developed on `feature/m10-teams-and-policy-rbac`, not yet merged to `main`
or pushed to origin — left for explicit user action, same convention M13
used. T13's own PROGRESS entry has the full closing note.

**This closes out the three-part goal this delivery effort was scoped
against from the start**: local username/password accounts with Google as
an optional, disable-able linked identity rather than the account itself
(M13, closed 2026-08-16); teams as a first-class grouping below the
organization (M10-T07/T08/T12); and a real, policy-based role and
permission-management system replacing the old hardcoded four-tier enum
(ADR-0013, M10). Both milestones are done.

- **Milestone**: M08 — Events, Audit & Real-Time remains next in the
  ledger's numeric order (unblocked — both `depends_on` entries, M04 and
  M07, are done) once M14 closes.
- **Command to continue**: `/milestone-deliver M14` (or
  `/milestone-deliver-auto M14`) — branch `feature/m14-task-reliability-and-agent-self-service`
  off `main` (after merging `feature/m10-teams-and-policy-rbac` and
  `feature/m13-...` if not already merged) per
  `git-workflow-standard.md`'s branch-per-milestone convention.

M09, M11, M12 remain queued behind M08 in their prior order, unaffected by
M10's or M14's insertion — nothing in their `depends_on` required either to
run first.

## How to resume

1. Read this file.
2. Read `.milestones/MILESTONE-<active>/MILESTONE.md` for the plan.
3. Read that milestone's `PROGRESS.md` — the last entry names the task in
   flight and why it was left there.
4. Run `/milestone-deliver` (interactive) or `/milestone-deliver-auto`
   (autonomous). Both pick up from the first unchecked task.

If `blocked: true`, read `blocker` above and resolve it before continuing.

## Milestone ledger

| ID  | Milestone                      | Status | Depends on | Tasks | Done |
|-----|--------------------------------|--------|------------|-------|------|
| M01 | Stabilize the Build            | done   | —          | 14    | 14   |
| M02 | Specification Truth            | done   | M01        | 7     | 7    |
| M03 | IAM Correctness & Scale        | done   | M01        | 16    | 16   |
| M04 | Agent Identity & M2M Tokens    | done   | M03        | 12    | 12   |
| M05 | GUI / API Parity               | done   | M01        | 12    | 12   |
| M06 | UX, Design System & A11y       | done   | M05        | 14    | 14   |
| M07 | Read-Path Scale                | done   | M05        | 14    | 14   |
| M08 | Events, Audit & Real-Time      | todo   | M04, M07   | 11    | 0    |
| M09 | Portable Single Binary         | todo   | M05, M07   | 9     | 0    |
| M10 | Teams & Policy-Based RBAC      | done   | M03, M04   | 13    | 13   |
| M11 | Observability & Deployability  | todo   | M08        | 12    | 0    |
| M12 | Test Depth & Release           | todo   | M06,M09,M11| 11    | 0    |
| M13 | Local Accounts & Linked Identity| done   | M01, M03   | 15    | 15   |
| M14 | Task Reliability & Agent Self-Service | todo | M04, M05 | 9   | 0    |

**Total: 169 tasks across 14 milestones — 117 done (M01 14, M02 7, M03 16, M04 12, M05 12, M06 14, M07 14, M10 13, M13 15).**

## Dependency graph

```mermaid
graph LR
  M01[M01 Stabilize] --> M02[M02 Spec Truth]
  M01 --> M03[M03 IAM]
  M01 --> M05[M05 GUI Parity]
  M03 --> M04[M04 Agent Identity]
  M05 --> M06[M06 UX & A11y]
  M05 --> M07[M07 Read Scale]
  M04 --> M08[M08 Events & Realtime]
  M07 --> M08
  M05 --> M09[M09 Single Binary]
  M07 --> M09
  M03 --> M10[M10 Teams & RBAC]
  M04 --> M10
  M08 --> M11[M11 Observability]
  M06 --> M12[M12 Test & Release]
  M09 --> M12
  M11 --> M12
  M01 --> M13[M13 Local Accounts]
  M03 --> M13
  M04 --> M14[M14 Task Reliability & Agent Self-Service]
  M05 --> M14
```

Milestones with no dependency edge between them may run in parallel on separate
branches. M02 is intentionally cheap and unblocking — it can run alongside
anything. M13 has no dependency edge to M10 — they are independent — but are
delivered in that order (M13 then M10) by product priority, recorded in both
milestones' "Why Now" sections rather than as a `depends_on` entry, since
neither actually blocks the other.

## Handoff notes

**2026-08-16 — M13 (Local Accounts & Linked Identity) closed: 15/15 tasks,
7/7 exit criteria, all verified against actual passing tests, not inferred
from task completion.**

A user can now exist, be invited, and log in entirely on a local username
and password — no email, no Google account, matching the milestone's own
exit criterion. Google is one optional linked identity per account rather
than the account itself, mirroring a Windows local-account/Microsoft-account
relationship; either credential can be added or removed independently, and
the system refuses to remove the last one standing at every point that
matters (`unlinkIdentity`, and by construction `setPassword` never removes
the only method).

Eleven things a next session would otherwise pay to rediscover:

1. **`users.id` never changed.** ADR-0012's central bet: every pre-existing
   Google user's id stays exactly what it was (their Google `sub`), and a
   new `linked_identities` table generalizes "how you prove who you are" so
   nothing else had to move. This is what kept the migration additive
   instead of a second M10-sized rewrite. Backfilled by
   `0031_backfill_google_linked_identities.sql` (SQLite) /
   `0018_...` (MySQL), idempotent, verified against a hand-built pre-M13
   fixture in `auth.test.ts`'s "a pre-migration user, backfilled, logs in
   via Google afterward with the exact same id".
2. **A defect was caught and fixed mid-milestone, not shipped**: before
   T08's fix, linking Google to a local account and then signing in with
   Google again would have silently created a *second*, duplicate account,
   because `completeLogin` resolved purely by `users.id === profile.id`.
   It now resolves through `linked_identities` first. If a future session
   touches `completeLogin`, read T08's PROGRESS.md entry before changing
   the resolution order.
3. **A security review (T14) found and fixed two real issues before
   close**, not just documented decisions: (a) `registerLocalUser` used to
   let an unauthenticated caller claim someone else's pending
   email-targeted invitation by typing their email with no proof of
   ownership — fixed by making local registration consume only
   username-targeted invitations, never email ones (email invitations
   still redeem correctly through Google, where the email is
   provider-verified). (b) The two password HTTP routes accepted any
   content-type Elysia recognized, including form-urlencoded — a
   CORS-preflight-free login CSRF vector — fixed by rejecting anything but
   `application/json` with a 415. Full writeup:
   `.milestones/MILESTONE-13-local-accounts-and-linked-identity/reviews/SECURITY-REVIEW-v1.md`.
4. **Two independent, complementary rate-limiting mechanisms**, not one:
   a per-source-IP bucket (`lib/loginRateLimiter.ts`, reusing ADR-0008's
   bounded rate limiter) ahead of the Connect adapter, and a per-account
   exponential lockout stored in `password_credentials` (5 failures locks,
   doubling up to 1 hour). A locked account gets a distinct `429` rather
   than folding into the generic `401` — a deliberate, recorded tradeoff
   (registration already leaks username existence, so hiding lockout state
   too would cost more in usability than it buys in secrecy).
5. **`Bun.password` (argon2id) needed no new backend dependency** — it
   ships with the Bun runtime already pinned in `.prototools`. The CLI
   *did* add one: `golang.org/x/term`, for a masked password prompt,
   recorded in `tech-stack.md` with a reason.
6. **The drizzle-sqlite snapshot drift discovered in M13-T02 is still
   unresolved** and will recur for any future schema change: migrations
   0024-0027 were hand-written without updating
   `drizzle-sqlite/meta/*_snapshot.json`, so `drizzle-kit generate` against
   the current schema re-proposes already-applied changes. Every M13
   schema migration (0028-0032) was hand-written to work around this
   rather than trusting the tool. **Flagged for M12** (already noted
   there); a next session touching sqlite schema should expect this.
7. **`OrgMember` (the contract model `listOrgMembers` returns) still has
   no `username` field** — only `User` and `Invitation` gained one. A
   member with no email and no name renders however `member.name ||
   member.email` happens to evaluate today (likely blank). Not fixed in
   M13 because it needs `orgs.handler.ts`'s `listOrgMembers` query changed
   too, and was judged GUI-screen territory for **T11/T12**'s successor
   work rather than in-scope here — but it was never picked up, since
   T11/T12 turned out to be about login/settings, not the member list.
   Worth a fresh look before M10 builds a team member list on the same
   pattern.
8. **`AuthService.adminResetPassword` (T10) has no GUI or CLI caller
   anywhere** — `gui:rpc-coverage`'s exception for it says so explicitly,
   naming "the Organizations member list" as where it belongs. Nothing in
   M13's 15 tasks scheduled that UI. A real, usable gap: an admin cannot
   currently reset a locked-out member's password from either app surface,
   only via a raw RPC call.
9. **Self-service password reset over email does not exist** — deliberate,
   per ADR-0012: this repo has no outbound email delivery yet. The only
   recovery path for a password-only account with no admin around is
   T10's `adminResetPassword`, which (per note 8) has no UI yet either.
10. **`mustChangePassword` enforcement lives in `ProtectedRoute`**, reading
    a field added to `GET /api/auth/session` (not `GetIdentityResponse` —
    a deliberate choice, see T12's note) and redirecting to `/settings`
    with a self-referential guard against a redirect loop. If a future
    session adds another top-level route outside `AppShell`'s guard (like
    `/login`/`/register`), it will not get this enforcement and does not
    need it.
11. **CLI gained `tasker auth set-password`**, beyond T13's literal scope
    — without it a CLI-only user handed a temporary password by an admin,
    or who registered locally with no GUI in reach, would have no way to
    ever change it.

**MySQL migrations for this milestone were verified against a live
container** (`docker compose up -d mysql`, `TASKER_MYSQL_INTEGRATION=1`)
at every schema-changing task, not just SQLite — a gap M04's handoff note
flagged as historically untested. `moon check --all` — 27 tasks, clean, at
close. `gui:e2e` (Playwright) was not run this session — it is `type: run`,
excluded from `moon check` by design (needs a booted backend + seeded DB +
browsers); its coverage of the new login/register/settings screens is
configuration (the routes and components exist and are unit-tested), not
an observed Playwright run, and that gap is named here rather than implied
closed.

**Deliberately deferred, with owners**: notes 7-9 above (member-list
username fallback and admin-reset UI — no clear owning milestone yet;
email-based self-service reset — needs an email-sending capability this
repo has never had, no milestone owns it either). The drizzle-sqlite
snapshot drift (note 6) is M12's.

**2026-08-16 — M13 (Local Accounts & Linked Identity) added and prioritized
ahead of M08, by explicit product direction.**

Three things were asked for together: users that don't require an email or a
Google account and can log in with a local password (disable-able per account
once an external identity is linked — a Windows local-account /
Microsoft-account relationship); a Team concept; and a real, data-driven
role/permission system. The second and third were already fully planned as
**M10 (Teams & Policy-Based RBAC)** — 13 tasks, unstarted, unblocked. The
first had no milestone, so **M13** was created for it (15 tasks) and set to
lead, with M10 following.

1. **Why a new milestone rather than a task inside M10.** M13 changes what a
   `users` row *is* — `users.id` today is literally the caller's Google
   profile id, and `email` is required. M10's grants/teams model keys on
   `userId` and does not care how that user authenticates, so the two are
   independent — M13 is sequenced first by priority, not by a real
   `depends_on` edge. Encoding it as a hard dependency would have overstated
   a requirement that does not exist; see M10's "Why Now" for the note left
   there instead.
2. **The load-bearing design decision, made without asking**: `users.id`
   does not change during migration. Every existing Google user gets a new
   `linked_identities` row (`provider='google'`, `providerUserId` = their
   current id); the `users.id` they already have stays their id. This is what
   keeps the migration from touching every other table's `userId` foreign key
   — the alternative (mint a new internal id, re-point every FK) would have
   made this a second M10-sized rewrite for no behavioural gain.
3. **M08 was not started** (`active_task: null`, no commits recorded against
   it) when this re-plan landed, so re-sequencing ahead of it abandoned no
   in-flight work. It resumes in its prior position once M13 and M10 close.
4. Full plan, exit criteria and task breakdown:
   `.milestones/MILESTONE-13-local-accounts-and-linked-identity/MILESTONE.md`.

**2026-08-16 — M07 Read-Path Scale closed (14/14 tasks; 5 of 6 exit criteria
met outright, the sixth met with a stated deviation).**

The read path is index-backed and measured. Search reads FTS5 (SQLite) or
InnoDB FULLTEXT (MySQL) and ranks by relevance; every list pages; the hot query
set is gated against full table scans; and p95 figures at the scale target are
committed in `PROGRESS.md`.

Seven things a next session would otherwise pay to rediscover:

1. **An index is a global change to every query plan, not a local
   improvement.** T09 added `projects_org_created_idx` to make an ordered
   project list seek instead of sort. It did — and it also made `projects` an
   attractive *driving* table for search, so SQLite inverted the join and
   probed the FTS index once per task. `universalSearch` went to **368
   seconds** at the scale target while every unit test still passed in
   milliseconds. **Re-measure after touching the schema**: `bun run
   measure:latency` from `apps/backend`.
2. **`CROSS JOIN` in `search.handler.ts` is load-bearing**, not style. It pins
   the join order so the FTS match set drives. Plain `JOIN` is a 4,500x
   regression waiting for the next index anyone adds.
3. **`snippet()` returns NULL on a contentless FTS5 table** rather than
   erroring, so anything built on it ships silently empty snippets. Snippets
   are built in the application; highlighting travels as **offsets, not
   markup**, so the client never renders server-supplied HTML.
4. **The exit criteria found what eleven task-level checks did not** — again,
   as in M06. Three criteria were unmet after T11: `fetchAllPages` still walked
   every page of a folder holding 100,000 artifacts, a deep link listed every
   folder x every page to find one row, and snippets were never highlighted.
   All three had explanatory comments; **a comment saying what the code does is
   not a justification**. Run the criteria as written.
5. **The measurement script lied before it told the truth.** Its first version
   measured every endpoint against the org owning the biggest task project, so
   `listProjects` and `listOrgMembers` reported sub-millisecond figures against
   an org with 1 project and 2 members. Each endpoint now resolves its own
   largest fixture and the header prints the sizes — check them before trusting
   a run.
6. **Two views are deliberately not virtualized**: Labels and TaskTypes are
   `flex-wrap` chip clouds with no rows, bounded by hand-created entries. This
   is the one exit criterion met with a deviation, and it is written into the
   criterion itself rather than hidden.
7. **MySQL differs from SQLite in two measured ways.** `innodb_ft_min_token_size`
   is 3, so two-character terms match nothing there while SQLite finds them
   (asserted by a test). And MySQL kept `Using filesort` for the ordered task
   list with every composite tried, even under `FORCE INDEX`, so the
   sort-backing indexes are SQLite-only on evidence — see
   `drizzle-mysql/0014_hot_query_indexes.sql`.

**MySQL tests are gated** behind `TASKER_MYSQL_INTEGRATION=1` and skipped by
default; run `docker compose up -d mysql` first. `moon check --all` is 26 tasks.

**Out-of-band work also landed on `main` this session**: the dashboard was
reworked around what needs a supervisor (see the entry at the end of M07's
`PROGRESS.md`), and `comments.spec.ts` — failing on a clean tree since before
this milestone — was repaired.

**2026-08-15 — M06 UX, Design System & Accessibility closed (14/14 tasks, 7/7
exit criteria).**

The interface is one system: colour comes from tokens, one `Dialog` primitive
owns every overlay, both themes pass axe on every view, and no view is a dead
end. The milestone was planned as 13 tasks and closed as 14 — the fourteenth is
the interesting part, below.

Six things a next session would otherwise pay to rediscover:

1. **The exit-criteria check found what thirteen task-level checks could not,
   and it was the largest defect in the milestone.** Criterion 2 says both
   themes render every view legibly. Running axe over whole pages in both themes
   — which no task had done — surfaced 25 contrast violations in light and 10 in
   dark, including `bg-primary/10 text-primary` at 4.2:1 on the **active
   navigation item of every page**. Every one of them was composed in a
   `className`, and the contrast gate reads token **pairs** in CSS, so there was
   nothing for it to check. **Run the exit criteria as written; do not infer
   them from the tasks.** M06-T14 is the fix, and `primary-subtle` is now a
   named pair the gate discovers on its own.
2. **Opacity modifiers discard the contrast a token guarantees.**
   `text-muted-foreground/70` (2.84:1), `opacity-50` on muted text (2:1),
   `bg-primary/20 text-primary` (3.38:1). If a colour needs to be quieter, that
   is a token, not a modifier. Related but distinct: `border-t/50` is not a
   utility *at all* — the modifier applies to colours and `border-t` is a width,
   so the class was never generated and the sidebar footer had no border
   (M06-T12, now a lint rule, along with runtime-assembled class names).
3. **Do not make user data load-bearing for legibility.** Label chips rendered
   the user's chosen colour as the *text* colour, so whether the name could be
   read depended on a value any user can pick — a plain grey measured 3.54:1.
   The colour is a swatch now and the name is `text-foreground`. No token and no
   lint rule can catch this shape; only rendering it can.
4. **Query errors were surfaced nowhere.** Every `isError` in `features/*`
   belonged to a *mutation*, so a failed list fell through to its empty branch
   and said "No projects found" — a confident claim that the data is gone.
   `ListState` renders the three states as one component and
   `gui:query-error-coverage` keeps the next view from omitting it. That gate
   found four readers the manual sweep had missed, two with the same lie
   (M06-T11).
5. **Three gates are new and will fail on ordinary future work**:
   `gui:query-error-coverage` (a new `useQuery` in `features/*` must render its
   error, or be excepted **with a reason**; an exception excuses one query, not
   a whole file), `gui:storybook-test` (axe over every story in a real browser —
   `type: run`, so it is out of `moon check` and explicit in CI), and
   `gui:storybook-a11y-config` (cheap, cached, pins the settings whose quiet
   reversal would make the a11y gate a no-op again). `gui:design-lint` gained
   two rules. `moon check --all` is 26 tasks.
6. **`test: 'todo'` is indistinguishable from `off`.** The Storybook a11y addon
   had been reporting to a panel nobody opened, and a critical violation had
   been sitting in a story the whole time — the gate found it on its first run.
   The runner is deliberately built from what was already installed
   (`storybook build`, `playwright`, `axe-core`, node's http server) rather than
   adding `@vitest/browser`. It must stay a **real browser**: `color-contrast`
   is the rule it exists to catch, and axe reports it `incomplete` under jsdom,
   which would make it a gate that cannot fail.

**Verified as configuration, not as an observed run.** Exit criterion 7 says the
a11y addon runs in CI at `error` and passes. It passes locally (21 stories, 0
violations) and the workflow step plus the browser install are committed and
pinned by a test — but no CI run has executed them. The first push will be the
first real proof.

**Deliberately deferred, with owners.** ADR-0009 keeps the primitives
hand-rolled and names the three conditions that would reverse it — if a later
milestone needs a combobox, a date picker or a menu with roving tabindex, read
it before building a fourth overlay by hand. The Kanban card is still a
`<div role="button">` (M12 owns E2E depth). `.pb-1`-style violations were fixed
at the source, but nothing yet runs axe over the *app* in CI the way
`storybook-test` does for stories — the whole-page sweep that found M06-T14 was
run by hand, and making it a gate is the obvious follow-up for **M12**.

**2026-08-15 — M05 GUI / API Parity closed (12/12 tasks, 6/6 exit criteria).**

A manager can now do the whole job in the browser: assign a person or an agent,
add reviewers, link artifacts to tasks in both directions, comment on and upload
artifacts, navigate a nested folder tree, and configure a task type's state
machine — with nothing on screen that the system does not actually know.

Seven things a next session would otherwise pay to rediscover:

1. **The recurring shape of this milestone was a missing read path, not a
   missing feature.** Four times — assignees, reviewers, task↔artifact links,
   artifact upload — the write path had existed since M01 and nothing could read
   it back, so the capability was invisible and therefore never exercised. If a
   later milestone finds a table nothing renders, check for this before assuming
   the feature is unbuilt.
2. **Names are resolved server-side, deliberately.** `Assignee.name`,
   `TaskReviewer.name`, `TaskArtifactLink.artifactName`/`taskTitle`. The reason
   is measured, not stylistic: the first assignee picker resolved names by
   paging the member catalogue, which against the 100,001-member fixture issued
   ~2,000 requests and never finished — the unbounded-list defect M03 spent a
   milestone removing, reintroduced on the client. **Do not add a list field
   that a client can only render by fetching a catalogue.** For artifacts the
   argument is stronger still: artifact rows carry up to ~15 MB of base64 in
   `content`, so a client resolving names itself downloads every body to render
   a list of file names.
3. **Pickers search, they do not enumerate.** Every one added here sends the
   typed text to the server's `filter` and shows one bounded page. This is not
   interchangeable with client-side filtering, and the unit tests cannot tell
   the difference — they mock the transport, so a page costing two thousand
   calls looks identical to one costing two. Run it against the seeded fixture.
4. **`gui:rpc-coverage` is a new gate** and it will fail when you add an RPC.
   That is the point: 92 of 95 RPCs are reached from the GUI, and an RPC added
   later and reachable only from the CLI is the exact defect this milestone
   existed to remove. Wire it up, or add it to `EXCEPTIONS` **with a reason** —
   the gate's own tests assert the reasons are real, and also catch a *stale*
   exception (one listed as unreachable that the GUI now calls), which is worse
   than no list.
5. **The deny-by-default sweeps caught a live hole again**, and this one was
   subtle: `deleteTaskStatusTransition` originally looked the edge up, returned
   success when it was missing, and authorized afterwards — so any id at all
   returned success with no authorization check, and because it never threw the
   sweeps would have counted it as classified. It now names the task type too
   and authorizes against that. **Authorize on something that exists
   independently of the row you are deleting.**
6. **`task_statuses` gained a `position` column** with migrations in both
   dialects (`0024` sqlite, `0011` mysql), backfilled by rowid and by id
   respectively. `reorderTaskStatuses` demands the complete list — a partial one
   leaves the unnamed statuses at stale positions, which is how two end up
   sharing one. Also: proto3 omits zero-valued scalars, so the first status
   arrives with `position` absent rather than `0`; the GUI never reads the
   number because the server returns the array ordered, but a client sorting
   client-side must treat missing as 0.
7. **The 95% GUI branch gate named real behaviour five milestones running**, and
   did so four separate times in this one. When it fires, read what it names —
   in this milestone it found the two distinct empty states in every picker, the
   name-or-email fallback for an invited member who has never signed in, an
   unreadable file, and moving a status *down* as distinct from moving it up.

**Deliberately deferred, with owners.** Deleting a task *status* is not built:
tasks store their status by name, so a delete would leave tasks in a status
their own type no longer contains, and the migration story (reassign? block?
soft-delete?) belongs to **M08**, which owns the data model — renaming a status
is the same problem. The Kanban card is a `<div role="button">`, so its
accessible name is its entire text including the labels of the controls nested
inside it (**M06**). Nothing fails the build for an inert control: "Filter
Tasks" was a button with no handler for three milestones, and `design-lint`'s
fabrication check does not match it because it looks for invented *state*, not
dead controls (**M06**). `rpc-coverage` matches method names textually, so a
local helper sharing an RPC's name would count as a call — the failure mode is a
false pass on one RPC, and resolving the client object per call is a
type-checker's job (**M12**).

**Verification method worth keeping.** Every exit criterion here was checked by
driving the real browser against a real backend and then reading the result back
through a *second* HTTP client — not through the page's own cache. Twice that
distinction mattered: the reviewer round-trip and the artifact-link round-trip
both look identical from inside the page whether or not the server stored
anything.

**2026-08-15 — M04 Agent Identity & M2M Tokens closed (12/12 tasks, 7/7 exit criteria).**

An agent is now a principal. It holds a token issued for it, scoped to one
organization and a fixed vocabulary of eight permissions, revocable on its own,
rate-limited on its own, and everything it writes is attributed to it because of
that credential rather than because the request said so. A scripted worker runs
with no browser login anywhere — verified end to end against a backend started
without `ENABLE_TEST_LOGIN`.

Six things a next session would otherwise pay to rediscover:

1. **`ADR-0008` is the contract for all of this.** Opaque 256-bit secret behind
   a `tskr_` prefix, stored only as a SHA-256 hash, always expiring (90 days
   default, 365 max, `NOT NULL`). SHA-256 rather than bcrypt is deliberate and
   argued: a 256-bit random has no terminating offline attack, and a slow hash
   would make the token unlookupable — every agent request becomes a table scan
   plus ~100 ms of deliberate work, i.e. a DoS surface on the auth path bought
   for nothing. Do not "harden" it to bcrypt without reading that section.
2. **Two deny-by-default sweeps now guard authorization**, and adding an RPC
   trips them on purpose. `viewer-denial.test.ts` (M03) and
   `agent-scope-sweep.test.ts` (M04) each enumerate every method on every
   handler and fail naming anything neither classified nor refusing. When your
   new endpoint breaks the build, classify it — do not add it to the allowlist
   to make the red go away. The agent sweep caught a real defect in its own map
   on its first run (five methods filed under `tasks` that live in
   `taskManagement`), which is the argument for writing the gate before the
   migration.
3. **`requireUser` refuses agents; `requirePrincipal` accepts them.** The rename
   of `requireUserId` → `requireUser` *is* the security control: every endpoint
   not deliberately migrated is closed to tokens by construction. If you want an
   endpoint to accept an agent, move it to `authorizePrincipal(db, principal,
   orgId, { scope, write })` and add it to `AGENT_RPC_SCOPES`. Scopes apply only
   to agents — a human's authority is still their org role, and giving people a
   parallel permission system is M10's decision.
4. **Three gates were reporting success on things they never checked**, all
   found this milestone and all fixed: the GUI tasks did not declare the
   generated contract as an input (so a contract change left their caches valid
   and `moon check --all` passed while `gui:build --force` failed with three
   type errors); `cli:test` ran only `./cmd/...`, so `internal/backend`'s tests
   had never executed; and `moon` caching generally keys on declared `inputs`,
   which is now the third distinct instance of this class. **When you add a
   gate, prove it fails.** And when you inject a fault to prove it, verify the
   injection actually applied — one of mine silently did not (it matched
   `assertOrgWriter` where the target used `assertOrgAdmin`) and the green run
   nearly got written up as "the gate cannot catch this".
5. **The security review found two live defects, not one.** A purged agent's
   tokens kept authenticating — `purgeAgent` deleted the agent row but not its
   tokens, and `resolveAgentToken` LEFT JOINs agents to check `deletedAt`, so a
   missing agent row yields NULL and the check never fires. And the rate
   limiter's bucket map was unbounded and reachable with no credential at all,
   since it keys on the presented token's hash *before* authentication. On that
   second one, note the eviction order: LRU is exactly wrong, because during a
   flood the genuine credential is by definition the least recently used.
6. **The contract is still two hand-maintained files** — `main.tsp` and
   `packages/shared-contract/tasker/health/v1/health.proto`, which is the one
   buf generates from. Every change edits both. `agentId` was removed from the
   comment and task-note request models with field numbers `reserved`, so an old
   client's field 4 cannot land in a future field.

**Deliberately deferred, with owners.** `ZodError` propagates as `internal`
rather than `invalid_argument` across *every* handler in the repo, so a
malformed agent request is told the server broke — repository-wide, so fixing it
means changing error semantics for every RPC (**M12**). Agent traffic is
unattributed in logs: `requestLogging` binds `userId`, which is null for a token
(**M11**). `createTask` stamps `createdBy: null` for an agent because the column
references `users.id`, so which agent created a task is not recoverable from the
row (**M08**). The rate limiter is per-instance; with N backends the effective
limit is N times one (**M11**). `assignTask` stays closed to agents — a token
that can reassign work to itself can help itself to any task (**M10**).

**Still open from earlier milestones**: `/settings` renders a placeholder nothing
links to (**M05** — now the active milestone, so this is its business);
`search_index` is a contentless FTS5 table with no writer (**M07**); MySQL
migrations have never been observed applying, here or in CI (**M12**); and the
`Real Integration Tests` workflow fails for the reason recorded in the M03 note
below — **not** missing secrets.

Verified at close: `moon check --all` 23 tasks pass · backend 556 pass / 7 skip ·
GUI 423 pass at 95.03% branch coverage · `cli:test` both packages · the
milestone's own Verification block, including
`TASKER_TOKEN=… ./apps/cli/cli tasks list --project … --json`, run against a
backend with `ENABLE_TEST_LOGIN` unset.

**2026-08-15 — M03 IAM Correctness & Scale closed (16/16 tasks, 8/8 exit criteria).**

An administrator can now operate an organization of 100,001 members: page it,
search it by name or email, filter by role, change roles, remove people safely,
and manage invitations — all inside 200 ms server-side and at 60 fps in the
browser. A viewer genuinely cannot write. Five things a next session would
otherwise rediscover the hard way:

1. **`db.transaction(async …)` is a no-op on bun:sqlite.** Drizzle hands the
   callback to `client.transaction(fn)`, which commits as soon as `fn`
   *returns* — and an async callback returns a promise immediately, so COMMIT
   lands before the first statement runs. This was not theory: `purgeOrg` left
   half-deleted organizations, and eight concurrent `createTask` calls all
   returned `ENG-1`. Both sites are now dialect-split — the SQLite branch is
   **fully synchronous** (`.run()`/`.all()`, no `await` anywhere inside, not even
   `await 0`, which defers past the commit); MySQL keeps the awaited form with
   `SELECT … FOR UPDATE`. Both occurrences were found by accident. A third would
   look identical: correct-reading code, a green suite, wrong behaviour only
   under concurrency. **Flagged for M12**: a lint rule or a wrapper that refuses
   an async callback on the sqlite driver.
2. **bun:sqlite silently discards errors from every statement after the first**
   in one multi-statement `run()`. Drizzle runs one chunk per `run()`, so a
   migration guard sharing a chunk with anything before it is decorative — the
   abort in `0021_scope_agent_roles_to_org.sql` was, until each statement got its
   own chunk. And drizzle splits on the literal `--> statement-breakpoint`
   *wherever it appears, including inside a comment*, which produces a
   comment-only chunk that fails as invalid SQL. Do not write that marker in
   prose.
3. **`viewer-denial.test.ts` is a build gate, not a test file.** It enumerates
   every RPC on every handler and denies by default, with an explicit read
   allowlist; a completeness test fails naming any method it does not recognise.
   Adding an RPC without classifying it breaks the build — which is how
   `listInvitations`/`revokeInvitation` were caught unguarded, unprompted. When
   you add an endpoint in M04, expect this to fail first; that is it working.
4. **A `requestAnimationFrame` delta of ~16.7 ms is 60 fps**, not a budget
   violation. Exit criterion 2's literal "16 ms frame budget" is unsatisfiable by
   any page including a blank one (measured: p50 16.70 ms). Judge dropped frames
   at ~25 ms (two vsyncs), and always run the empty-page control beside the
   measurement — on this GPU-less WSL2 box it is the only thing separating the
   component's cost from the environment's. The members table went 14.6% → 0.0%
   dropped by removing `measureElement` from fixed-height rows and memoising the
   row component. Note that memo is silently reversible: passing an inline arrow
   as a row callback restores the old cost with no test failing.
5. **`moon` caches on declared `inputs`, and a missing one is invisible.**
   `shared-contract:compile` omitted the `.proto` that buf actually reads, so
   contract edits did not invalidate it. Likewise `cli:format` could never fail,
   because `gofmt -l` lists files and exits 0 — unformatted Go went through it
   during this milestone. Both fixed, and both were found by injection rather
   than by reading. Prove a new gate fails before trusting it.

**The contract is two hand-maintained files.** TypeSpec (`main.tsp`) *and*
`packages/shared-contract/tasker/health/v1/health.proto` — buf generates from the
latter and `buf.yaml` excludes `tsp-output`. 195 messages in each, kept in sync
by hand. Every contract change in M04 must edit both.

**Deliberately deferred, with owners**: audit history for invitation revocations
(**M08**); the viewer-visible-but-disabled control question (**M06** — M03 chose
to leave members-table controls active and let the server refuse, but hid the
invitations section entirely, and the two design notes record why they differ);
frame timing as a CI gate and the async-sqlite-transaction lint rule (**M12**).

Still open from M02 and unchanged: `/settings` renders a placeholder nothing
links to (**M05**), and `search_index` is a contentless FTS5 table with no
writer (**M07**).

**The `Real Integration Tests` workflow's documented cause was wrong.** Every
handoff note since M01 has said it fails for want of `GITHUB_TEST_TOKEN` /
`GITHUB_TEST_REPO`. The run on this merge prints `HAS_TOKEN: true` and
`GITHUB_TEST_REPO: huyz0/tasker-test-sandbox` — the secrets are configured and
have been. The actual failure is 3 tests in
`repositories.integration.test.ts`, identical before and after M03 (0 pass /
3 fail in both), throwing `Repository link not found` from
`getRepositoryLinkOrgId`. Cause: nothing on that path sets `STANDALONE`.
`integration.yml` sets only `TASKER_REAL_INTEGRATION` / the two GitHub vars,
`moon run backend:test-integration` runs `bun test <file>` directly, and that
file does not import `src/test/setup.ts` (which is where `STANDALONE=true` is
set for the normal suite). So `isStandalone()` is false, `authz.ts` resolves the
**MySQL** schema objects, and the test's mock db — which compares
`table === schemaSqlite.repositoryLinks` by identity — matches nothing and
returns no rows. Likely a one-line `STANDALONE: "true"` in the workflow env,
unverified because reproducing it needs the sandbox token. Not fixed here: it is
outside M03 and I could not verify the fix. **Do not spend time chasing the
secrets.**

Verified at close: `moon check --all` 23 tasks pass · backend 444 pass / 7 skip ·
GUI suite green at 95.27% branch coverage · `gui:e2e` 13 pass ·
`bun run measure:members` PASS at 1k/10k/100k.

**2026-08-15 — M02 Specification Truth closed (7/7 tasks, 5/5 exit criteria).**

`.specs/` now describes the system that exists. What changed, and the three
things a next session would otherwise rediscover the hard way:

1. **`moon run :spec-drift` is a gate now** (`moon check --all` is 23 tasks;
   CI Workspace job runs it). It compares every manifest identifier against the
   **In Use** tables of `tech-stack.md`, both directions, and has 21 tests.
   Adding a dependency without a table row fails the build — verified by
   injecting `date-fns`. Prose does not count: the check reads table cells, and
   four of the seven drifts it found on its first run were entries the document
   described in prose the tables did not carry.
2. **Do not conclude "unused" from a missing import.** M02-T01 marked
   `better-sqlite3` and `@storybook/addon-onboarding` as removal candidates on
   that reasoning. Both are load-bearing: `drizzle-kit` does
   `import("better-sqlite3")` inside its own bundle for the sqlite dialect and
   declares it as no kind of peer, and the addon is registered at
   `apps/gui/.storybook/main.ts:13`. Removing the first would have broken
   `drizzle-kit push --config drizzle.sqlite.config.ts`.
3. **`api-standard.md` was rewritten and its previous contents are void.** It
   described REST — resource URIs, HTTP verb semantics, `/api/v1/` versioning, a
   `{ data, meta }` envelope — for a system that serves contract-first
   Connect-RPC. It is auto-injected for API work by `AGENTS.md` §3, so any past
   session that added an endpoint was reading the wrong architecture. Three
   other standards told agents to run `npx`/`npm`, which `AGENTS.md` forbids,
   and `testing-standard.md` specified 80% coverage against a 95% enforced gate.

Five ADRs now exist in `.specs/adr/` (0001–0005), numbered from 1 rather than
the 0003–0007 the plan assumed — its predecessors were never written. They
record oxlint-only linting, `LIKE` search, no separate read store, in-process
counters over OTel, and hand-rolled UI primitives. Each names what it forecloses
and the milestone that would reverse it.

**Criterion 5 is observed, not inferred.** `main` was fast-forwarded to this
work and pushed; CI run 31857839549 passed all six jobs, and the **Specification
drift** step ran inside the Workspace job. The earlier hedge in this note — that
the gate was configuration until a run was seen — is retired. The separate
**Real Integration Tests** workflow still fails on every push, as it has since
at least July. Pre-existing and untouched by M02. The reason recorded here
originally — missing secrets — was wrong; see the M03 note above for the real
cause.

**Deliberately deferred**: a permanent gate for `NAVIGATION.md`. Its route map
was verified against `App.tsx` by a throwaway script (14 nodes, 14 routes) and
will drift the moment someone adds a route. The same argument that justifies
`spec-drift` applies, but M02's exit criteria name only the dependency check.
Flagged for **M05**, which is the milestone that adds routes.

**Two open decisions handed to later milestones**: `/settings` is a route that
renders a placeholder and that nothing links to — M05 either gives it an entry
point or deletes it. And the `search_index` FTS5 table is contentless with no
writer, read only by the health probe — M07 must populate it or drop it, because
a table named `search_index` that indexes nothing is a trap.

**2026-08-15 — The gates are tested now.**

A fresh review looking for structural weakness rather than answering a set
question found one that dwarfed the rest: **1,151 lines of harness script with
zero tests**, deciding whether every skill, workflow and adapter in the
repository is sound. Three of their rules had already turned out to be wrong
when checked by hand this session.

1. **`validate.test.mjs` — 24 tests, zero dependencies** (`node:test`). Each
   builds a fixture harness in a temp dir, breaks exactly one thing, and asserts
   the matching rule fires. A rule that cannot be made to fail enforces nothing.
   `HARNESS_ROOT` / `DESIGN_LINT_ROOT` are testing seams; nothing sets them in
   normal use. The suite runs *before* the gate in `moon run :skills-check`.
2. **`skill-forge evolve` read data nobody records.** It asked for "the session's
   friction". Retargeted to the four records that exist: `PROGRESS.md` divergence
   lines and `blocked` entries, `STATE.md` handoff notes, and
   `git log --stat -- .agents/` for churn.
3. **Nothing said file content is data.** Skills read `.specs/`, source, command
   output and fetched pages and act on them. `context-budget.md` now has a Trust
   section, and `AGENTS.md` §5 carries the one-line rule: instructions come from
   the user, the running skill, and its protocols — nowhere else.

Known and unfixed: portability is verified structurally (adapter parity, host
character limits) but has never been *observed* — nothing in this repo has been
run under Codex or Antigravity. Treat the claim as configuration, not evidence.

**2026-08-15 — Epic lifecycle retired; harness cut to 16 skills.**

A per-skill audit asked whether each one earns its place. The command layer had
been skipped in the previous review — the invocable surface is skills *and*
commands, and only 19 of 44 had been examined.

1. **The epic system is gone.** All 8 epics were created 2026-03-30 to
   2026-04-27; milestones arrived 2026-08-15 and no epic ran again. Its only
   live references were five milestone tasks pointing at `.epics/adr/`, a
   directory `git log` proves never existed. `epic-run` and `epic-archive` are
   deleted; their design and four-lens review discipline is
   `milestone-deliver/references/heavy-task.md`, reached from step 12.
2. **ADRs have a real home**: `.specs/adr/`, with a format README. Decisions
   outlive the work item, so they sit beside the specs. Reviews and UX go to
   `.milestones/<MILESTONE>/{reviews,design}/`. `work-ledger.yml` is v3 with no
   `epics` type.
3. **`epic-prioritize` → `milestone-prioritize`.** Same 8-advisor council; it now
   reads the milestone registry and feeds `/milestone-plan`. Reports go to
   `.milestones/council/`.
4. **`tdd` is a protocol, not a skill.** It never produced an artifact and you
   never run it *instead of* a task. `.agents/protocols/tdd.md` now binds every
   implementation path automatically. `/tdd` is gone.
5. **`epic-standard.md` moved to `.archive/EPIC-FORMAT.md`** — it documents a
   format nothing generates. It is out of `index.yml`.
6. **Command descriptions route now.** All 25 read like "Milestone Deliver" —
   their own name in title case. The generator takes the skill's description
   instead, trimmed to the "what" half because Claude Code loads skill *and*
   command entries and copying both pays twice.

Tier 0 is **5,482 chars ≈ 1,370 tokens** — up from 1,043, deliberately. The old
figure was cheap because 400 of its chars said nothing. It also corrects an
earlier entry that reported 943 tokens by counting only skills.

New validator rules: two workflows resolving to the same skill *and* mode
(`/epic-prioritize` and `/epic-prioritize-auto` were byte-identical for a
session), and a command description that only restates its name. Both were
verified by injection.

Verified: `moon check --all` 22 tasks · validator 0/0 · 160 markdown files clean.

**2026-08-15 — Harness reviewed for token cost, consistency and scope.**

1. **Routing moved into the always-on layer.** `AGENTS.md` §3 now carries a
   surface → standards table. Selecting the two binding standards no longer
   costs an `index.yml` read or a skill invocation; `/context-inject` is for the
   ambiguous case only. Tier 0 fell 4,069 → 3,773 chars (≈943 tokens for 19
   skills).
2. **Scope is explicit.** `context-budget.md` now defines what a *task*, a
   *session* and a *sub-agent* each load and drop. Sub-agents get paths and
   their own brief — never the orchestrator's accumulated context.
3. **Consistency is enforced, not asked for.** The validator now fails on
   `# Execution Mode` (the section is `# Modes`), an `-auto` workflow against a
   skill with no `# Modes` table, `AskUserQuestion` without the autonomy
   protocol, and a second lockfile inside a skill.
4. **`markdown-lint` was quietly broken twice.** Its default `**/*.md` skipped
   every dot-directory, so "lint everything" checked 7 files and ignored
   `.agents/`, `.specs/` and `.milestones/`; and it claimed in a comment to
   honour a project config it never read. Both fixed. It also shipped its own
   `bun.lock` and 22MB of `node_modules` — a second lockfile
   `dependency-standard.md` forbids. Its three dependencies now come from the
   workspace root and are declared in `knip.json`'s `ignoreDependencies`,
   because knip cannot see `.agents/**`.
5. **`moon run :docs-lint` is now a gate**, in `moon check --all` and CI. The
   whole tree is clean (160 files). Conventions that differ from markdownlint's
   defaults are recorded with reasons in `.markdownlint-cli2.jsonc` — notably
   MD025 (skills use sibling `#` sections by design) and MD029 (skill steps are
   numbered across the file, so `--fix` must not restart them per section).

Verified: `moon check --all` 22 tasks pass · validator 0 errors 0 warnings.

**2026-08-15 — UI/UX design harness added (outside the milestone plan).**

Researched the 2026 design-skill landscape (Vercel Web Interface Guidelines,
Anthropic `frontend-design`, `plugin87/ux-ui-agent-skills`) and adopted the
patterns rather than the packages — Snyk's ToxicSkills audit found 36.8% of
scanned third-party skills flawed.

1. **`/design-review`** — judges rendered screenshots, not source.
   `apps/gui/scripts/screenshot.mjs <route>` captures light and dark at
   375/768/1280 with reduced motion, and reports console errors. Needs the dev
   server and `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu22.04-x64` on this box.
2. **`moon run gui:design-lint`** is now part of `moon check --all` and CI. It
   fails on raw hex, raw Tailwind palette utilities, token pairs below WCAG AA,
   and the statically checkable Web Interface Guidelines. Escape hatch:
   `design-lint-disable-next-line <rule> — <reason>`.
3. **axe is real.** `jest-axe` is installed and every page asserts
   `expectNoA11yViolations`. `ui-testing-standard.md` §1 had required this since
   it was written while axe was never installed. Do **not** add `axe-core` as a
   direct dependency — `jest-axe` brings it and `knip` fails the build on it.
4. **Design-system tokens gained status semantics** — `success`/`warning`/`info`
   with solid and subtle pairs, plus `destructive-subtle`. Four pre-existing
   WCAG AA failures were fixed by adjusting `--primary`, `--muted-foreground`,
   `--destructive` (light) and dark `--primary-foreground`, so the app's purple
   and red are marginally darker than before.
5. **`Card` and `Button` were unstyled `<div>`/`<button>` passthroughs.** The
   screenshot loop caught it in the first capture. Both now carry their Shadcn
   styling, and `Button` has the `variant`/`size` API that
   `frontend-standard.md` §1 already described.

Verified: `moon check --all` 21 tasks pass; `CI=true moon run gui:e2e` 13 pass;
the a11y gate was confirmed to fail on an injected `button-name` violation.

**2026-08-15 — Agent harness consolidated (outside the milestone plan).**

The harness in `.agents/` was rebuilt against four reference systems (agent-os,
oh-my-claudecode, metaswarm, get-shit-done) and the verified skill conventions of
Codex, Antigravity and Claude Code. No milestone task was touched.

What a next session needs to know:

1. **Slash commands changed.** `/epic-define`, `/epic-design`,
   `/epic-design-review`, `/epic-implement`, `/epic-implement-review` and
   `/epic-end-to-end` are now one skill, `/epic-run` (`/epic-run-auto` runs every
   phase). `/standards-create`, `/standards-discover` and `/standards-index` are
   `/standards-manage`. `/standards-inject` and `/product-inject` are
   `/context-inject`. `/skill-manage` is `/skill-forge`. `/caveman` is gone — its
   rules are always-on in `.agents/protocols/response-style.md`.
2. **`.claude/` is generated.** Never hand-edit it. Run
   `node .agents/skills/skill-forge/scripts/sync-adapters.mjs` after any change
   under `.agents/`. All 18 skills and 23 workflows now have adapters; before
   this, only three did.
3. **`moon check --all` now includes `tasker:skills-check`**, which fails on dead
   path references, host-limit overruns, adapter drift and standards-index drift.
   It is also a CI step in the Workspace job.
4. **`.epics/` and `.test-plans/` are empty and no longer exist.** All three
   remaining epics were `done` with every review approved, so they and the nine
   test plans were archived to `.archive/`. The directories reappear when
   `/epic-run` starts the next epic.

Pre-existing and untouched: `markdown-lint` reports 487 errors repo-wide (was 615
across the same files), almost all `MD060` table style in the epic-prioritize
advisor references. It is not part of `moon check`.

**2026-08-15 — M01 Stabilize the Build closed (14/14 tasks, 7/7 exit criteria).**

What changed, in one pass: the GUI's task and artifact detail views are driven
by the URL, unknown routes render a Not Found view, and every global-search
result resolves to a route that renders its entity. The health probe no longer
writes to the database it reports on (1,000 pings leave the file
byte-identical), and a migration clears the rows earlier builds left. CI now
runs the GUI suite behind its 95% coverage gate plus a real Playwright job
against a seeded backend; the Go toolchain is pinned to what `go.mod`
requires; `knip` gates unused files, dependencies and exports; backend fixtures
fail loudly instead of swallowing errors; and the pre-commit hook is one
documented command away from active.

Three things a next session should know:

1. **A clean clone now bootstraps itself** — every JS-consuming task depends on
   `shared-contract:install-deps`. That task is deliberately anchored to
   `packages/shared-contract`, not the workspace root: moon derives the ROOT
   project's id from the checkout directory name, so a `root:`/`tasker:` target
   breaks in a clone named anything else. Do not "tidy" it back to the root.
2. **Use the `:task` form for root tasks** — `moon run :dev`,
   `moon run :setup-hooks`. Plain `moon run dev` fails with "No default project
   has been configured"; that is why the README changed.
3. **`gui:e2e` is `type: run` on purpose**, keeping it out of `moon check` (and
   so out of the pre-commit hook), because it needs a booted backend, a seeded
   database and installed browsers. CI runs it explicitly after seeding one.

A follow-up pass then cleared the residuals this close had left open: the seed
is re-runnable against one database, `bun run test` no longer wipes the local
dev data (it opened with `rm -rf .data`), artifact list invalidations no longer
read a stale folder id from a mutation closure, knip runs as its own CI job
rather than only inside `moon check`, and the inert `.moon/toolchain.yml` is
gone so `.prototools` is the sole home of the version pins. Note that
`moon setup` is still a no-op — moon 2 ignores that file's deprecated platform
keys — and toolchains come from proto's `auto-install`.

Exit criterion 3 is now **observed**, not inferred: `main` was fast-forwarded to
this work and pushed, and CI ran all six jobs green — Shared Contract, Workspace
(knip), GUI, GUI E2E (Playwright), Backend, CLI. The first run was red and worth
recording: `gui:e2e` exited "No tasks found", because `type: run` (which keeps
e2e out of `moon check`, and so out of the pre-commit hook) also implies
`runInCI: false`. Every local run had passed because `CI` was unset. `runInCI`
is now explicit. A workflow that declares the right jobs is not the same as one
observed to run them — which is why that criterion was hedged.

The separate **Real Integration Tests** workflow (`integration.yml`) still fails
on every push, as it has since at least July. Pre-existing and untouched by M01.
The reason recorded here originally — missing secrets — was wrong; see the M03
note for the real cause.

M02, M03 and M05 all have their dependencies satisfied now and can run in
parallel on separate branches. M02 is the cheap unblocking one.
