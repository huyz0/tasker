# M04 — Agent Identity & M2M Tokens — Progress Journal

Append-only. Newest entry at the bottom.

---

## M04-T01 — Design the token model and record it as an ADR

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `.specs/adr/ADR-0008-agent-tokens.md`
- **Verified**: the ADR names the hash algorithm (SHA-256, four mentions) and
  the scope list (eight `<family>:<verb>` scopes in a table).
  `moon run tasker:docs-lint` — 167 files clean.
- **Artifacts**: ADR only. No UX pass (no screen), no test plan (nothing to
  execute yet) — both come with T05/T10.
- **Decisions, and what each forecloses**:
  - **Opaque random secret over a signed token.** The session path already mints
    HMAC payloads, so reuse was the obvious move. Rejected because a signed
    token is valid until expiry and revocation then needs a deny-list consulted
    on every request — which is the `revokedSessions` round-trip the session
    path already pays. For a credential whose purpose *is* independent
    revocation, storing state is honest rather than storing none and adding a
    table to compensate.
  - **SHA-256, not bcrypt.** "Never store a credential with a fast hash" is a
    password rule, and this is not a password: 256 bits of CSPRNG output has no
    terminating offline attack. A slow hash would also make the token
    unlookupable — every agent request becomes a scan plus ~100 ms of
    deliberate work, i.e. a DoS surface on the auth path bought in exchange for
    nothing. HMAC with a pepper was the closest rejected option and is recorded
    as reconsiderable if tokens ever carry low-entropy material.
  - **Eight fixed scopes, and no scope grants org administration.** Org
    mutations, `AuthService` and token issuance are refused to agent principals
    categorically, not by omitting a scope — an agent that can mint tokens
    escapes every other limit here. Deny-by-default on unmapped RPCs, following
    M03's viewer sweep, so a new endpoint is inaccessible to agents until
    someone classifies it.
  - **Expiry is mandatory** (90d default, 365 max, `NOT NULL`). The cost lands
    on T11: rotation has to be documented well enough to do without downtime.
- **Found while designing, not while implementing**: exit criterion 6 wants
  `429` + RFC 7807 + `Retry-After`, but `lib/problemDetails.ts` states in its
  first line that it is not for RPC endpoints, and ConnectRPC has its own error
  envelope. The two cannot both hold inside a handler. Resolved in the ADR by
  putting the limiter in an HTTP wrapper ahead of the Connect adapter — which
  means Connect clients see a transport error, not a typed one, so **T09's CLI
  must recognise a bare 429 itself**. Named here so T08 and T09 do not each
  rediscover it.
- **Next**: M04-T02

---

## M04-T02 — Add the `api_tokens` table to both dialects

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/db/schema.sqlite.ts`, `src/db/schema.mysql.ts`,
  `drizzle-sqlite/0023_api_tokens.sql`, `drizzle-mysql/0010_api_tokens.sql`,
  both `meta/_journal.json`, `src/db/migrate-api-tokens.test.ts` (new, 11 tests)
- **Verified**: `moon run backend:test` — 455 pass / 7 skip / 0 fail (was 444).
  SQLite verified by **execution**: the real drizzle migrator run against a
  fresh file applies all 24 migrations, and the resulting table has every column
  `NOT NULL` that should be, with `api_tokens_token_hash_idx` unique.
- **Verified only structurally on MySQL — read this before trusting it**: the
  verify line says "both dialects", and the MySQL half was *not* observed. There
  is no MySQL server in this environment (no `mysqld`, no Docker daemon) and
  **none in CI** — no workflow starts one and no test opens a mysql2 pool. That
  is true of every MySQL migration in this repository, not only this one. What
  runs instead is a structural check that the generated file still describes the
  schema: columns present, `expires_at`/`scopes`/`token_hash` `NOT NULL`,
  `last_used_at`/`revoked_at` nullable, one row per token hash. It would catch a
  bad hand-edit; it would not catch DDL MySQL rejects. Recorded for **M12**.
- **Divergence from the task's field list**: added `tokenPrefix` and `createdBy`.
  The prefix lets the list view (T05, T10) identify a token as `tskr_a1b2…`
  without holding anything secret — without it, a list of tokens is a list of
  names with no way to match one against a leaked string. `createdBy` is who
  issued it, which the revoke flow and any later audit both want.
- **`orgId` is stored on the token, not joined through the agent.** Deliberate:
  the interceptor authorizes on it every request, and reading it from the row
  means re-homing an agent cannot silently widen a credential that already
  exists.
- **`drizzle-kit generate` emitted catch-up statements for M03's migrations.**
  0021/0022 (sqlite) and 0008/0009 (mysql) were hand-written, so the meta
  snapshot never learned about them and the generator re-emitted
  `agent_roles.org_id` and `invitations.expires_at` as new work. Applying that
  against an existing database fails with a duplicate column. Stripped from both
  files, and a test now asserts they stay stripped, because the next person to
  run `generate` will hit exactly this again. The snapshots written by this run
  are current, so the trap is closed going forward.
- **Deliberate-break check**: the five MySQL structural tests passed on first
  run, so `expires_at` was made nullable in the file to confirm the suite goes
  red (it did — one failure, the right one) before being restored.
- **Next**: M04-T03

---

## M04-T03 — Introduce a `Principal` type

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/modules/auth/session.ts` (`Principal`, `currentPrincipalKey`),
  `src/lib/authz.ts` (`requirePrincipal`, `requireUser`), 95 call sites across
  12 handler modules, `src/lib/principal.test.ts` (new, 9 tests),
  `src/lib/authz.test.ts` (two fixtures)
- **Verified**: `moon run backend:test` — 464 pass / 7 skip / 0 fail (was 455).
  `moon check --all` — 23 tasks pass.
- **The rename is the security control.** `requireUserId` became `requireUser`,
  which *refuses* agent principals, rather than becoming `requirePrincipal`,
  which would accept them. Every one of the 95 existing call sites is therefore
  closed to tokens by construction; an endpoint opens to agents only when
  someone deliberately moves it to `requirePrincipal` in T06/T07. Deny-by-default
  falls out of the rename instead of depending on anyone remembering — the same
  shape as M03's viewer sweep.
- **`requireUser` answers `PermissionDenied`, not `Unauthenticated`,** to an
  agent. The agent *is* authenticated; a 401 would tell a correctly-credentialled
  caller to authenticate again, which for an autonomous worker is an endless
  retry loop rather than an error.
- **`Principal` is a discriminated union, not one shape with optional fields.**
  An agent has no `userId` and a user has no `scopes`; merging them would make
  every consumer check a field that is only sometimes meaningful.
- **Divergence from "existing human tests pass unchanged"**: one did not, and it
  is worth being precise about why. `authz.test.ts` built its context from
  `{ get: () => "user-1" }` — a stub answering *every* key with the same string,
  so it also claimed `currentPrincipalKey` held a `Principal` whose `kind` was
  the letter `"u"`. It failed on the shape of the stub, not on any behaviour a
  caller can observe. Rebuilt on real `createContextValues()`. The alternative —
  type-guarding `requirePrincipal` until the stub passed again — would have been
  writing production code to satisfy a mock.
- **Fixed in passing**: `assertOrgAdminOfAny`'s doc comment still explained
  itself as guarding a global, tenant-shared `agentRoles` catalogue. M03-T05
  scoped that table to one organization (ADR-0007), so the comment described a
  schema that no longer exists and justified the function on grounds that had
  gone. Rewritten to say what it is actually for now (the `/api/debug/*` routes)
  and to warn against reaching for it out of convenience.
- **Next**: M04-T04

---

## M04-T04 — Resolve agent tokens in the session interceptor

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/lib/agentToken.ts` (new), `src/lib/authenticate.ts` (new),
  `src/index.ts` (interceptor), `src/lib/agentToken.test.ts` (new, 17 tests),
  `src/lib/authenticate.test.ts` (new, 14 tests)
- **Verified**: `moon run backend:test` — 495 pass / 7 skip / 0 fail (was 464).
  `moon check --all` — 23 tasks pass. And the verify line end to end against a
  running server, which is the part the unit tests cannot reach:

  | Request | Response |
  |---|---|
  | live token | `permission_denied: This endpoint requires a human session` |
  | same token, after `revokeToken` | `unauthenticated: Authentication required` |
  | forged `tskr_…` string | `unauthenticated` |

  `permission_denied` on the first line is the proof: the token authenticated,
  and `requireUser` then refused it because no endpoint has been opened to
  agents yet (T06/T07). No restart between the two calls. `lastUsedAt` was
  stamped on the token row without the request waiting for it.
- **The resolution logic is not in the interceptor.** `src/index.ts` is in
  `coveragePathIgnorePatterns` and cannot be exercised by the suite, and the
  decision about *who a caller is* is the last thing that should be untestable.
  `resolvePrincipal(db, headers)` lives in `lib/authenticate.ts`; the
  interceptor is now four lines that call it and set two context keys.
- **A bad agent token does not fall back to the session.** A revoked token
  presented with a valid cookie resolves to nothing, rather than quietly
  downgrading to the human — otherwise a dead agent credential keeps working as
  somebody else.
- **A test that could not fail, found by injection.** The assertion above passed
  even after the early return was removed, because `resolveSessionPayload`
  prefers the `Authorization` header and so never reaches the cookie. The
  outcome was right for a reason unrelated to the code it appeared to guard.
  Added a second test pinning that ordering explicitly, so if someone makes
  session resolution fall back to the cookie — the moment a dead token starts
  borrowing a session — it fails instead of looking harmless. Kept both: two
  layers enforce this, and a test per layer is what makes either failure visible.
- **`lastUsedAt` is not stamped on a rejected token.** The token list is where an
  operator confirms a revocation worked; "last used: just now" on a dead
  credential reads as live. Verified by injection (stamping unconditionally goes
  red).
- **A deleted agent's token stops working**, checked in the same indexed query
  as the hash lookup rather than as a second round trip.
- **Divergence**: the task named `lib/sessionRevocation.ts`; it was not touched.
  Agent revocation is a column on the token row, not a deny-list — a token is
  already stateful, so it needs no `revokedSessions` equivalent (ADR-0008).
- **knip caught an over-export**: `TokenRejection` was exported with no importer.
  Unexported; the union is still reachable through `TokenResolution`.
- **Next**: M04-T05

---

## M04-T05 — `createAgentToken`, `listAgentTokens`, `revokeAgentToken`

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `packages/shared-contract/main.tsp` and
  `tasker/health/v1/health.proto` (both, in parallel — 3 RPCs, 6 messages),
  `src/modules/agents/agents.handler.ts`, `src/lib/scopes.ts` (new),
  `src/modules/agents/agent-tokens.test.ts` (new, 18 tests),
  `src/lib/viewer-denial.test.ts` (classification + fixture)
- **Verified**: `moon run backend:test` — 516 pass / 7 skip / 0 fail (was 495).
  `moon check --all` — 23 tasks pass. Verify line proven by injection: adding
  `tokenHash` to the wire shape turns the suite red.
- **Review**: `reviews/M04-T05-token-rpcs-v1.md` — approved, 2 medium, 3 low.
- **The plaintext cannot leak by omission.** `AgentToken` has no plaintext and
  no hash field on the wire at all, so the guarantee is structural rather than a
  property of how carefully `toWireToken` was written.
- **The viewer sweep caught the three new endpoints immediately**, as T03's
  entry predicted it would. `listAgentTokens` is deliberately *not* on the
  viewer read allowlist: who holds a credential, its prefix and its last use is
  administrative information.
- **The sweep also caught a test that would have passed for the wrong reason.**
  `revokeAgentToken` answers NotFound before authorization — right for not
  leaking existence, but it meant the fixture was asserting a viewer cannot
  revoke a token *nobody has*. Seeded a real token in the viewer's org so the
  case exercises the authorization path.
- **`expiresInDays: 0` means unset, and that is the wire format's doing.** A
  proto3 `int32` has no field presence, so a client omitting the field sends 0;
  refusing 0 would refuse everyone who did not set an expiry. My test asserting
  0 is rejected was wrong and now asserts the default with the reason inline.
- **Found, not fixed, recorded**: validation failures propagate as `ZodError`,
  which ConnectRPC maps to `internal` — an agent sending a malformed request is
  told the server broke, when `invalid_argument` is correct and is the
  difference between "retry" and "fix your request". Pre-existing and
  repository-wide (every handler calls `Schema.parse` directly), so fixing it
  here would change error semantics for every RPC on the way past. **T12** owns
  it.
- **knip caught two exports written one task early** (`AgentScope`,
  `isAgentScope`, both for T07). Removed; they arrive with their first caller.
  Third time this milestone the gate has caught this.
- **Next**: M04-T06

---

## M04-T06 — Derive attribution from the principal

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `comments.handler.ts`, `task_notes.handler.ts`, both contract
  files, `apps/cli/cmd/tasks_comments.go`, `cmd/tasks_notes.go`,
  `apps/gui/src/components/ui/comments/CommentContext.tsx`, `apps/gui/moon.yml`,
  `comments/attribution.test.ts` (new, 13 tests), plus 6 rewritten tests
- **Verified**: `moon run backend:test` — 527 pass / 7 skip / 0 fail.
  `moon run gui:test` — 404 pass, 95.27% branches. `moon check --all` — 23 pass.
- **Review**: `reviews/M04-T06-attribution-v1.md` — approved; 1 high, 1 medium,
  1 low.
- **The hole was bigger than the task described.** Two paths trusted the request
  body, not one: `createComment` filed a comment under any `agentId` the caller
  named, *and* `assertCommentAuthor` compared the stored `agentId` against one
  taken from the **request** — so any member could also edit or delete any
  agent-authored comment by naming that agent. The second is the sharper of the
  two and was not in the task's description; it was found by reading the
  function the task pointed at.
- **Kept `assignTask.agentId` deliberately**, against the task's wording of
  "comment, note and task request models". That field is the *assignee*, not the
  author. Removing it would delete the ability to assign work to an agent, which
  is the product's core function rather than an attribution leak. Attribution is
  who wrote a thing; assignment is who should do it.
- **`createTaskNote` is now agent-only**, which is a behaviour removal rather
  than just a field removal. `task_notes.agent_id` is NOT NULL, so a note has no
  representable human author. The cost: `tasker tasks note-add` cannot be used
  by a logged-in human until **T09** ships `--token`. The milestone's stated
  breaking change, arriving on schedule, but a real gap between T06 and T09.
- **A gate was passing on stale output.** `moon check --all` was green while
  `moon run gui:build --force` failed with three type errors: the GUI tasks
  never declared the generated contract as an input, so a contract change left
  their caches valid. Same defect M03 found on `shared-contract:compile`, in
  four more places. CI would have caught it on a cold cache; the pre-commit hook
  would not, which is what the hook is for. Fixed and verified by touching the
  generated file and confirming the build re-runs instead of reporting cached.
- **Old clients are not rejected**, just re-attributed: Zod strips unlisted
  keys, so a not-yet-rebuilt client still sending `agentId` succeeds and is
  attributed correctly. Chosen over erroring on unknown fields because the field
  is gone from the contract, so no new client can learn to send it.
- **Field numbers 3/4 are `reserved`**, not reused, per `api-standard.md` §2.
- **Next**: M04-T07

---

## M04-T07 — Enforce scopes per RPC

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/lib/scopes.ts` (`AGENT_RPC_SCOPES`), `src/lib/authz.ts`
  (`authorizePrincipal`), 30 endpoints across 8 handler modules,
  `src/lib/agent-scope-sweep.test.ts` (new, 6 tests),
  `src/lib/scope-enforcement.test.ts` (new, 7 tests)
- **Verified**: `moon run backend:test` — 540 pass / 7 skip / 0 fail (was 527).
  `moon check --all` — 23 tasks pass. Verify line: a `tasks:read` token gets
  `permission_denied: this token lacks the tasks:write scope` on `createTask`.
- **Review**: `reviews/M04-T07-scope-enforcement-v1.md` — approved; 1 high,
  1 medium, 1 low.
- **The sweep caught a real defect in my own map on its first run.** Five
  methods were filed under `tasks` when they live in `taskManagement`
  (`createTask`, `listTasks`, `listTaskReviewers`, `updateTask`,
  `updateTaskStatus`). The effect was the worst combination available: migrated
  to `authorizePrincipal` so they accepted tokens, while the sweep saw them as
  unmapped and expected refusal. This is the entire argument for writing the
  gate before the migration rather than after.
- **The error names the missing scope**, not just "denied" — the difference
  between an agent that can correct itself and one that retries forever.
- **An injection that silently did not apply.** The first attempt at proving the
  sweep — opening `deleteTask` to agents without mapping it — matched on
  `assertOrgWriter` while `deleteTask` uses `assertOrgAdmin`, so the file was
  unchanged and the green run meant nothing. I nearly recorded "the gate cannot
  catch this". Re-run against the real edit it failed naming
  `taskManagement.deleteTask`. **Check the injection landed before believing the
  result.**
- **Deliberately closed to agents**, recorded in the map rather than inferred:
  everything destructive (archive/restore/purge/`deleteTask`), all org and
  membership administration, token issuance, and `assignTask` — a token that can
  reassign work to itself can help itself to any task in the org. M10 owns
  delegation.
- **Scopes apply only to agents.** A human's authority is still their org role;
  a viewer is still refused by `assertOrgWriter`, asserted directly so ADR-0006
  cannot lapse silently. A parallel permission system for people is M10's call.
- **Found, recorded for M08**: `createTask` stamps `createdBy: null` for an
  agent, because the column references `users.id`. Which agent created a task is
  therefore not answerable from the row. M08 owns audit persistence.
- **Next**: M04-T08

---

## M04-T08 — Per-token rate limiting with `429` + `Retry-After`

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `src/lib/rateLimit.ts` (new), `src/lib/rateLimit.test.ts` (new,
  10 tests), `src/index.ts` (HTTP wrapper ahead of the Connect adapter),
  `src/config.ts` (`AGENT_RATE_LIMIT_BURST`, `AGENT_RATE_LIMIT_WINDOW_MS`)
- **Verified**: `moon run backend:test` — 550 pass / 7 skip / 0 fail (was 540).
  `moon check --all` — 23 pass. And the verify line end to end against a running
  server started with a burst of 5 over a 5s window:

  ```
  requests 1-5   403  (past the limiter; refused by authz, which is the point)
  requests 6-8   429  Content-Type: application/problem+json   Retry-After: 1
  body           {"type":"about:blank","title":"Too Many Requests","status":429,
                  "detail":"Rate limit exceeded. Retry after 1 second."}
  after waiting  403  (throttle lifted; recovers without a restart)
  8 unauthenticated requests  401 x8, never 429
  ```

- **A token bucket, not a fixed window.** A fixed window lets a caller spend its
  whole allowance in the last millisecond of one window and again in the first
  of the next — twice the intended rate at the boundary, which is exactly where
  a retrying agent lands.
- **Keyed on the hash of the presented token, not the token id.** Resolving an
  id means performing the database lookup this is meant to protect. The digest
  is the same one the store uses, so the key is stable per credential and the
  plaintext never enters the map.
- **Human sessions are not throttled here** — browser traffic is bounded by a
  person's hands, and the criterion is about tokens. Confirmed: eight
  unauthenticated requests returned 401 eight times, never 429.
- **`Retry-After` is never 0**, and waiting exactly that long is asserted to
  succeed. A `Retry-After: 0` invites an immediate retry certain to be refused,
  which for an autonomous caller is a hot loop.
- **Buckets are evicted when idle.** Keyed by credential, the map would
  otherwise retain every token that ever made one request for the life of the
  process. Eviction runs on a miss rather than on a timer, so an idle process
  holds no work.
- **Stated, not hidden**: the limiter is in-process and per-instance. A shared
  counter needs Redis or a per-request database round trip, and `tech-stack.md`
  has neither. With N backend instances the effective limit is N times this one.
  **M11** owns multi-instance deployment and inherits it.
- **knip caught a third premature export** (`RateLimiter`). Removed.
- **Next**: M04-T09

---

## M04-T09 — CLI: `auth token create|list|revoke`, `--token`, `TASKER_TOKEN`

- **Status**: done
- **Date**: 2026-08-15
- **Changed**: `cmd/auth_token.go` (new), `cmd/auth_token_test.go` (new,
  6 tests), `cmd/root.go` (`--token` persistent flag),
  `internal/backend/credentials.go` (`ResolveToken`, `SetTokenOverride`),
  `internal/backend/client.go` (`DescribeRPCError`, `DescribeHTTPError`),
  `internal/backend/token_test.go` (new, 7 tests), `apps/cli/moon.yml`
- **Verified**: `moon run cli:test` — cmd and internal/backend both pass.
  `moon check --all` — 23 pass. And the verify line end to end against a running
  backend, with a scripted agent and no browser login anywhere:

  ```
  admin mints a token via the CLI      → plaintext returned once, JSON for scripts
  TASKER_TOKEN=… tasks create          → T09-1 created
  TASKER_TOKEN=… tasks list            → sees it
  TASKER_TOKEN=… tasks note-add        → agentId: agent-t09
  TASKER_TOKEN=… tasks comment-add     → authorName: "Worker"
  read-only token, tasks create        → permission_denied: this token lacks
                                          the tasks:write scope
  read-only token, tasks list          → allowed
  auth token list                      → prefixes, states, last-used; no secret
  auth token revoke, then next request → unauthenticated, no restart
  ```

- **Precedence is `--token` > `TASKER_TOKEN` > saved session**, and the ordering
  is the point rather than a detail. A scripted agent exports `TASKER_TOKEN` in
  an environment where a human may also have run `tasker auth login`; if the
  leftover session won, the script would silently run as that person, with their
  permissions, attributing its work to them.
- **`note-add` works again**, closing the gap T06 opened — now for the right
  reason: the note is authored by the authenticated agent rather than by a human
  naming one.
- **`cli:test` was only running `./cmd/...`.** `internal/backend` holds the
  client, the auth interceptor and credential resolution, and its tests — which
  already existed — had never been run by the gate. Found because a new test
  file compiled locally while `moon run cli:test` reported green without having
  built it. Now `./...`; both packages pass. Third gate this milestone that was
  reporting success on something it never checked.
- **A 429 needed special handling in the client**, which ADR-0008 predicted:
  putting the limiter ahead of the Connect adapter means a generated client sees
  a transport failure, and connect-go maps a non-Connect 429 to
  `CodeUnavailable`. Left alone, the CLI would tell an agent its backend is down
  when it needs to slow down. `DescribeRPCError` matches the message text, which
  is fragile and is the price of answering 429 with RFC 7807 — recorded rather
  than hidden.
- **Next**: M04-T10
