# M13 — Local Accounts & Linked Identity — Progress Journal

## M13-T01 — Write the ADR for local password auth + linked identities

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `.specs/adr/ADR-0012-local-password-auth-and-linked-identities.md`
- **Verified**: The ADR states the last-sign-in-method invariant (§5),
  the hashing choice and why it differs from ADR-0008's for the opposite
  reason (§4), and a `## Rollback` section naming the exact tables to drop
  and the one behavioural risk (accounts with no email and no other
  credential) that rollback cannot undo automatically.
- **Notes**: Five decisions bundled into one ADR rather than five separate
  ones — they are not independent (the id-stability choice in §3 is what
  makes the rollback in §Rollback cheap; the hashing choice in §4 only makes
  sense once §1/§2 established that a password is now a first-class,
  separately-removable credential). `Bun.password` (argon2id) needs no new
  `package.json` dependency — verified interactively (`bun -e`) that
  `Bun.password.hash`/`.verify` work and round-trip correctly before writing
  it into the decision.
- **Next**: M13-T02 — make `users.email` nullable, add `users.username`.

## M13-T02 — users.email nullable, users.username added, both dialects

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `db/schema.sqlite.ts`, `db/schema.mysql.ts`,
  `drizzle-sqlite/0028_users_email_optional_username.sql`,
  `drizzle-sqlite/0029_backfill_usernames.sql`,
  `drizzle-mysql/0015_users_email_optional_username.sql`,
  `drizzle-mysql/0016_backfill_usernames.sql`,
  `drizzle-sqlite/meta/_journal.json`, `drizzle-mysql/meta/_journal.json`,
  `src/db/migrate-users-email-optional-username.test.ts`
- **Verified**: `bun test src/db/migrate-users-email-optional-username.test.ts`
  — 10 pass, applies the real migration files against an in-memory sqlite DB
  seeded in the exact pre-0028 shape, and checks the MySQL files structurally.
  `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts` — 1 pass
  against the live `docker compose` MySQL, confirmed by `DESCRIBE users`
  showing `email` nullable and `username` present and unique. Full suite:
  `STANDALONE=true bun test` — 640 pass, 0 fail (no regression from a
  core-table change).
- **Notes**: `username` is **nullable at the database level**, not `NOT
  NULL` as the task's own wording says — deliberately, matching this
  schema's existing "logically required, DB-nullable, enforced at the app
  layer" convention (see the comment now in `schema.sqlite.ts`). Required-ness
  is enforced by Zod on every user-creating RPC (T06 onward), the same way
  `invitations.role` is `NOT NULL` with a default but *this* column has no
  safe default to fall back to. Recorded as a deliberate divergence from the
  task's literal wording, not an oversight.
  Discovered a pre-existing defect while generating the migration:
  `drizzle-sqlite/meta/*_snapshot.json` has not been regenerated since
  0023 — every migration from 0024 onward was hand-written without updating
  the snapshot. Running `drizzle-kit generate` against the current schema
  therefore re-proposes changes already applied by 0024 and 0027
  (`task_statuses.position`, `remote_pull_requests_task_id_idx`), which would
  fail with "duplicate column"/"index already exists" if blindly applied to
  an already-migrated database. Discarded the auto-generated file and
  hand-wrote the migration instead, following the same pattern
  `migrate-api-tokens.test.ts` already documented for the MySQL side of this
  exact problem. **Not fixed here** — resyncing the snapshot for the whole
  history is a separate task; flagging it for **M12** (Test Depth & Release,
  which already owns "MySQL migrations have never been observed applying"
  per M04's handoff note — the same class of defect).
- **Next**: M13-T03 — `password_credentials` and `linked_identities` tables.

## M13-T03 — password_credentials and linked_identities tables, both dialects

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `db/schema.sqlite.ts`, `db/schema.mysql.ts`,
  `drizzle-sqlite/0030_password_credentials_linked_identities.sql`,
  `drizzle-mysql/0017_password_credentials_linked_identities.sql`, both
  `meta/_journal.json`,
  `src/db/migrate-password-credentials-linked-identities.test.ts`
- **Verified**: `bun test src/db/migrate-password-credentials-linked-identities.test.ts`
  — 12 pass, including that linking the same `(provider, provider_user_id)`
  to two different users is refused (the constraint that makes "sign in with
  Google" resolve to exactly one account) and that a user can hold more than
  one linked provider. `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`
  — 1 pass; `DESCRIBE`/`SHOW INDEX` against the live container confirm both
  tables, the FKs and the composite unique index. Full suite: 652 pass, 0 fail.
- **Notes**: `passwordHash` has no separate params/version column — per
  ADR-0012 §4, `Bun.password`'s PHC-format string carries its own algorithm
  and cost parameters, so there is nothing to version separately.
  `provider` is a fixed MySQL `enum('google')` but plain `text` on SQLite
  (no native enum type there), matching this schema's existing
  `organization_members.role` split — validated at the app layer on the
  SQLite side. Hit the same stale-snapshot problem as T02
  (`drizzle-kit generate` re-proposed the users-table rebuild and the
  0024/0027 drift again, since discarding T02's generated file left the
  snapshot at 0023): discarded the generated file again and hand-wrote a
  migration scoped to only the two new tables. This will recur for every
  remaining schema task in this milestone until the M12 snapshot resync
  lands — noting the pattern once here rather than repeating the explanation
  in every subsequent entry.
- **Also**: both new tables carry `@knipignore` — neither is imported as a TS
  symbol yet (T04 populates `linked_identities` in raw SQL; both get a real
  consumer in T06/T08). Each tag names the task that removes it; `bunx knip
  --workspace apps/backend` is clean with them in place.
- **Next**: M13-T04 — migrate existing users onto `linked_identities`.

## M13-T04 — Backfill linked_identities for every pre-existing (Google) user

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `drizzle-sqlite/0031_backfill_google_linked_identities.sql`,
  `drizzle-mysql/0018_backfill_google_linked_identities.sql`, both
  `meta/_journal.json`,
  `src/db/migrate-backfill-google-linked-identities.test.ts`
- **Verified**: `bun test src/db/migrate-backfill-google-linked-identities.test.ts`
  — 6 pass, including that `linked_identities.provider_user_id` for a
  backfilled row equals the user's own (unchanged) `id` — the load-bearing
  claim in ADR-0012 §3 — and that re-running the migration is a no-op
  (idempotency guard). `TASKER_MYSQL_INTEGRATION=1 bun test src/db/db.mysql.test.ts`
  — 1 pass; a direct `COUNT(*)` against the live container showed
  `linked_identities` and `users` at parity (28/28) after applying. Full
  suite: 658 pass, 0 fail.
- **Notes**: Pure data migration, no handler change — `completeLogin` still
  authenticates by `users.id === profile.id` exactly as before, unaffected by
  whether a `linked_identities` row exists yet. That's deliberate: this task
  only needs the *fact* of the link to exist so T06/T08 can query it; making
  login logic actually consult `linked_identities` is T06's job. Exit
  criterion "every user who could log in via Google before this milestone
  can still do so afterward... no id change" is trivially satisfied right
  now for exactly that reason, and stays satisfied through T06 because the
  Google path there is additive (a lookup-by-linked-identity that falls back
  to id-equality), not a replacement.
- **Next**: M13-T05 — password hashing module (`Bun.password`, argon2id).

## M13-T05 — Password hashing module

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `src/lib/credentials.ts`, `src/lib/credentials.test.ts`
- **Verified**: `bun test src/lib/credentials.test.ts` — 8 pass, 100%
  line/function coverage. Covers the round-trip, wrong-password rejection,
  that the plaintext never appears in the stored hash, independent salting
  (same password hashed twice never matches byte-for-byte but both verify),
  cross-parameter verification (a hash minted at lower memory/time cost than
  Bun's current default still verifies — the actual point of PHC-format
  storage per ADR-0012 §4), and that a malformed or foreign-format
  (bcrypt-shaped) hash string is rejected rather than throwing.
- **Notes**: No "params" or "version" column and no wrapper type around the
  hash — `Bun.password`'s PHC-format string already is the versioned record,
  so adding one here would be a second, redundant source of truth. Confirmed
  `Bun.password`'s own default (`m=65536,t=2,p=1`, i.e. 64 MiB) already
  exceeds OWASP's argon2id minimum (19 MiB); the module names the algorithm
  explicitly rather than relying on Bun's default staying `argon2id`
  forever, but does not override the cost parameters. `MIN_PASSWORD_LENGTH`
  (12) is exported now for T06 to enforce at the RPC boundary — length over
  composition rules, since composition rules push predictable substitutions
  without raising guess-resistance.
- **Next**: M13-T06 — `loginWithPassword`/`registerLocalUser`/
  `setPassword`/`changePassword` RPCs, converging with `completeLogin`.

## M13-T06 — Login/register/setPassword, converged with completeLogin

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `packages/shared-contract/main.tsp`,
  `packages/shared-contract/tasker/health/v1/health.proto` (both hand-
  maintained contract files, per M04's note that every change edits both),
  regenerated `packages/shared-contract/gen/ts/...`,
  `apps/cli/gen/tasker/health/v1/...`, `src/lib/authz.ts` not touched,
  `src/modules/auth/auth.ts`, `src/modules/auth/auth.handler.ts`,
  `src/modules/auth/auth.test.ts`, `src/modules/auth/auth.handler.test.ts`,
  `src/lib/viewer-denial.test.ts`, `src/lib/agent-scope-sweep.test.ts`
- **Verified**: `bun test src/modules/auth/` — 61 pass, 100% line/function
  coverage on `auth.ts` and `auth.handler.ts`. Full suite: 683 pass, 0 fail.
  `bunx knip --workspace apps/backend` clean (see Notes). `gui:typecheck`
  (`tsc -b`) clean after the `User.username` field landed. `go build ./...`
  and `go test ./...` clean after regenerating the Go client from the
  updated `.proto`. `tsp format --check` clean after auto-formatting.
- **Notes**:
  - **Two RPCs became two HTTP routes + one RPC, not three RPCs.**
    `loginWithPassword`/`registerLocalUser` are unauthenticated (there is no
    principal yet — that's the whole point of logging in) and need to set a
    `Set-Cookie` header, exactly like the existing Google callback. This
    repo already splits "session establishment" into plain Elysia HTTP
    routes (`auth.ts`) from "everything else" as authenticated ConnectRPC
    (`auth.handler.ts`) — forcing login into an RPC would mean either a
    ConnectRPC method that skips `requireUser` (a new, unprecedented shape)
    or awkward header-setting through the RPC context. Added
    `POST /api/auth/password/register` and `POST /api/auth/password/login`
    as HTTP routes instead, both calling the *same* `sessionCookie(...)`
    helper the Google callback already uses — that shared call is the
    literal "converge on the same session issuance path" the task asked
    for. `setPassword` (authenticated, acting on the caller's own account)
    stayed a ConnectRPC method on `AuthService`, consistent with the rest
    of the app. Divergence from the task's literal RPC-only wording,
    recorded here rather than silently reinterpreted.
  - **One `setPassword`, not two (`setPassword`/`changePassword`).** A
    single RPC covers both: `currentPassword` is required and verified when
    a credential already exists, ignored when it doesn't (a Google-only
    account setting a password for the first time has nothing to prove).
    Two RPCs would have meant the client deciding which one to call by
    first checking whether a credential exists — logic the server already
    has to do internally either way.
  - **`consumePendingInvitations` extracted from `completeLogin`.** Both
    Google login and local registration now call the same function; it's a
    no-op when no email is given, which is the normal case for a bare
    local registration. Username-keyed invitations are still T09's job —
    this only makes email-keyed acceptance shared rather than duplicated.
  - **Contract note**: `User.username` was added as plain `string` (not
    `string?`) — matching this message's existing convention for
    `name`/`avatarUrl`, which are also nullable in the DB but non-optional
    in the contract; a proto3 empty string already reads as "absent" and
    the GUI's existing `member.name || member.email` fallback pattern
    already treats empty string as falsy. This meant `email` needed **no**
    contract type change at all to become "optional" — it already tolerates
    an empty/absent value the same way.
  - **GUI fallback labels intentionally NOT touched here.**
    `AssigneePicker`/`ReviewerPicker`/`CurrentUser`/`Organizations` all
    fall back `name || email` today; a member with neither now shows a
    blank label until they're extended to also fall back to `username`.
    That's a real gap, but it needs `OrgMember` in the contract (a
    different model from `User`) to carry `username` too, plus the
    `listOrgMembers` query to select it — wider than this task's Files list
    and squarely GUI-screen territory. Flagged for **T11/T12**, which own
    the GUI login/settings surfaces, rather than expanded into here
    unbounded.
  - **Sweep tests updated, not bypassed.** `setPassword` added to
    `viewer-denial.test.ts`'s `NOT_ORG_SCOPED.auth` (managing one's own
    credential has nothing to do with any org role — a viewer may call it,
    same as `getIdentity`) and to `agent-scope-sweep.test.ts`'s `REQUESTS`
    (denied to agents categorically, since the whole `auth` handler is in
    `NO_AGENT_ACCESS` per ADR-0008).
  - Login/register failures return one generic "Invalid credentials"
    message regardless of which part was wrong (unknown username, no
    password credential on the account, wrong password) — tested
    explicitly, since a differentiated message is a username-enumeration
    oracle.
- **Next**: M13-T07 — rate limit and lock out password login.

## M13-T07 — Rate limit and lock out password login

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `src/config.ts`, `src/lib/loginRateLimiter.ts` (new),
  `src/lib/loginRateLimiter.test.ts` (new), `src/lib/rateLimit.ts`
  (`rateLimitProblem` gained an optional title/detail override),
  `src/lib/rateLimit.test.ts`, `src/index.ts`, `src/modules/auth/auth.ts`,
  `src/modules/auth/auth.test.ts`
- **Verified**: `bun test src/modules/auth/ src/lib/loginRateLimiter.test.ts
  src/lib/rateLimit.test.ts` — 82 pass, 100% coverage on `loginRateLimiter.ts`
  and `auth.ts`. Full suite: 692 pass, 0 fail.
- **Notes**: Two independent, complementary mechanisms, as the task named:
  - **Per-source-IP throttle** (`lib/loginRateLimiter.ts`) reuses
    `createRateLimiter` — the same bounded, correctly-evicting bucket store
    ADR-0008 built for agent tokens — rather than a new implementation.
    Keyed on `req.socket.remoteAddress` (the direct peer, not
    `X-Forwarded-For`: nothing in this deployment trusts a specific reverse
    proxy, and trusting a caller-supplied header would let one attacker
    spread a flood across as many "sources" as requests). Wired into
    `index.ts` ahead of `authRoutes.handle`, for `/api/auth/password/*`
    only, mirroring exactly how `agentRateLimiter` already runs ahead of the
    Connect adapter.
  - **Per-account exponential lockout** lives in `password_credentials`
    (columns already added in T03): 5 consecutive failures locks the
    account, each subsequent lock roughly doubling (30s, 60s, 120s, ...) up
    to a 1-hour cap. `attemptPasswordLogin` replaces T06's
    `verifyPasswordLogin` — same signature intent, now returns a 3-way
    `PasswordLoginResult` (`ok`/`invalid`/`locked`) instead of `string | null`.
  - **Recorded decision, not an oversight**: a locked account gets a
    distinct `429` (with `Retry-After` and a named "Account temporarily
    locked" title) rather than being folded into the generic `401 Invalid
    credentials`. The more paranoid option — hiding lockout state entirely
    to deny an enumeration oracle — was rejected because T06's registration
    endpoint already reveals "username is already taken" on a duplicate
    username, so hiding it a second time on login buys little while
    costing every genuinely-locked-out user any way to learn they should
    wait rather than that they mistyped their password. Matches this
    repo's one existing precedent for the tradeoff, ADR-0008 §5's
    rate-limit response (also distinct, also carries Retry-After).
  - A locked account's password is never even checked — cheaper, and it
    means a lock cannot be probed into revealing whether a guess was close.
  - `index.ts`'s wiring itself is not unit-tested, matching this file's
    existing, accepted boundary (the same is true of `agentRateLimiter`'s
    wiring, which has no test either) — `loginRateLimiter.test.ts` covers
    the exported factory, `rateLimit.test.ts` already covers the bucket
    mechanics it's built on.
- **Next**: M13-T08 — `linkIdentity`/`unlinkIdentity` RPCs with the
  last-sign-in-method guard.

## M13-T08 — Link/unlink Google, with a correctness fix to Google login itself

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `packages/shared-contract/main.tsp` + `.../health.proto` +
  regenerated `gen/`, `src/lib/authz.ts` (`countActiveSignInMethods`,
  `assertNotLastSignInMethod`), `src/lib/authz.test.ts`,
  `src/modules/auth/auth.ts` (`completeLogin` reworked, `/google/link` HTTP
  route added, `/google/callback` grew a `link:` branch),
  `src/modules/auth/auth.handler.ts` (`listLinkedIdentities`,
  `unlinkIdentity`), `src/modules/auth/auth.handler.test.ts`,
  `src/modules/auth/auth.test.ts`, `src/lib/viewer-denial.test.ts`,
  `src/lib/agent-scope-sweep.test.ts`, `apps/gui/scripts/rpc-coverage.mjs`
- **Verified**: `bun test src/modules/auth/ src/lib/authz.test.ts` — 110
  pass, ~100% coverage on every touched file. Full suite: 713 pass, 0 fail.
  `bunx knip`, `gui:typecheck`, `gui:rpc-coverage` (2 new exceptions,
  reasoned, owned by T12), `go build`/`go test`, `tsp format --check` all
  clean.
- **Notes**:
  - **Linking reuses `/api/auth/google/callback`, not a second registered
    redirect URI.** Proving ownership of a Google account needs the OAuth
    redirect dance no RPC can do, so `GET /api/auth/google/link` (requires
    an existing session, then redirects to Google with `state=link:<nonce>`)
    feeds into the *same* callback login already uses, branching on the
    `link:` prefix. Registering a second redirect URI with Google would be
    a permanent operational cost (another Console entry, another env var)
    for a URL that does 90% the same thing. `linkIdentity` never became an
    RPC at all for this reason — recorded divergence from the task's
    literal naming, same shape as T06's `loginWithPassword`/
    `registerLocalUser` divergence.
  - **The defect this task would otherwise have shipped, and its fix.**
    Before this task, `completeLogin` resolved a Google login purely by
    `users.id === profile.id`. Once linking exists, a locally-registered
    user who links Google and later clicks "Sign in with Google" again
    would have silently gotten a **second, duplicate account** — the
    lookup would find nothing at `users.id === profile.id` (their real id
    is `u-<uuid>`, not the Google sub) and create one. `completeLogin` now
    resolves through `linked_identities` first, falling back to the legacy
    `users.id === profile.id` path only for a Google identity truly never
    seen before. Covered by a test that links, logs out, logs back in via
    plain Google, and asserts the *same* userId comes back with no second
    `users` row created. This was necessary to ship linking correctly, not
    scope creep — flagged here because it touches `completeLogin` itself,
    outside T08's literal Files list.
  - Both call sites that used to pass `profile.id` directly to
    `sessionCookie()`/`createSessionToken()` now use `completeLogin`'s
    *returned* userId instead — the specific line that would have kept the
    bug alive even with the resolution fix in place.
  - A **new** Google identity (never linked, never seen) still gets
    `users.id = profile.id` exactly as before M13, plus a `linked_identities`
    row alongside it (so it resolves through the fast path from then on)
    and a derived `username` (same provably-unique email-local-part + id
    scheme as T02's backfill), keeping the "every user-creating path sets a
    username" invariant intact across all three paths now
    (`registerLocalUser`, the backfill, and this one).
  - **`unlinkIdentity`'s last-method guard computes "count after removal"
    explicitly** (`countActiveSignInMethods(...) - 1`) rather than special
    -casing "count is 1" — the same shape `assertNotLastSignInMethod` will
    reuse for T10's admin password reset, which removes from the *other*
    direction (clearing a password, not a linked identity).
  - Conflict handling: linking a Google identity already linked to a
    *different* account returns `409` and does not re-point the link —
    silently stealing a link would let anyone who can complete that
    account's consent screen take over its linked identity. Linking the
    *same* identity to the *same* account twice is a no-op success, since a
    doubled callback (browser back-button, retry) is normal, not an attack.
  - `listLinkedIdentities`/`unlinkIdentity` classified in both sweeps the
    same way `setPassword` was in T06 (`NOT_ORG_SCOPED` — a viewer manages
    their own credentials regardless of org role; denied to agents
    categorically via `NO_AGENT_ACCESS`).
- **Next**: M13-T09 — username-keyed invitations.

## M13-T09 — Username-keyed invitations

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `packages/shared-contract/main.tsp` + `.../health.proto` +
  regenerated `gen/` (TS and Go), `db/schema.sqlite.ts`,
  `db/schema.mysql.ts`, `drizzle-sqlite/0032_invitations_username.sql`,
  `drizzle-mysql/0019_invitations_username.sql`, both `meta/_journal.json`,
  `src/db/migrate-invitations-username.test.ts`,
  `src/modules/orgs/orgs.handler.ts` (`InviteUserSchema`, `inviteUser`,
  `listInvitations`), `src/modules/orgs/orgs.test.ts`,
  `src/modules/auth/auth.ts` (`consumePendingInvitations` generalized),
  `src/modules/auth/auth.test.ts`, `apps/cli/cmd/orgs.go` (`--username`
  flag), `apps/cli/cmd/orgs_test.go`
- **Verified**: `bun test src/modules/auth/ src/modules/orgs/
  src/db/migrate-invitations-username.test.ts` — 146 pass. Full backend
  suite: 728 pass, 0 fail. `go build ./...` and `go test ./...` clean (both
  broke first, from the contract's `email` field going `optional` — see
  Notes). `bunx knip`, `gui:typecheck`, `tsp format --check` all clean.
- **Notes**:
  - **`invitations.email` had to become nullable too**, mirroring `users` in
    T02 — an invitation targeting a bare username has no email at all, not
    an empty one. Zod's `.refine()` on `InviteUserSchema` enforces **exactly
    one** of email/username at the API boundary (not "at least one"): the
    two are alternate keys, not a combinable filter, and `consumePendingInvitations`
    matches each independently. Same table-rebuild-on-SQLite dance as T02's
    `users` migration, hand-written for the same stale-snapshot reason,
    verified against a hand-built pre-migration fixture the same way.
  - **`consumePendingInvitations` takes an `identity` object now, not a
    bare `email` string** — every call site updated. Deliberately
    asymmetric between the two callers: `completeLogin` (Google) passes
    only `{ email }`, never the derived username a brand-new Google user
    gets, because that username was never chosen by the person or typed by
    an inviting admin — matching against it would accept an invite on a
    coincidence of the derivation scheme, not on intent. `registerLocalUser`
    passes both, since a local user's username is a real, chosen identifier.
    Covered by a test that seeds an invitation using the exact string
    `deriveUsernameFromEmail` would produce for an incoming Google profile,
    and asserts it is *not* consumed.
  - **The CLI broke on this change**, discovered by `go build`, not
    predicted: proto3 `optional string email` became `*string` in the
    generated Go struct (it was a plain, always-present `string` before),
    so `apps/cli/cmd/orgs.go` no longer compiled. Fixed by adding a
    `--username` flag alongside `--email` with the same exactly-one
    validation the server enforces, checked client-side first for a
    CLI-shaped error message rather than a raw RPC rejection. This is the
    kind of gap `gui:typecheck`-equivalent gates exist to catch on the Go
    side — `go build`/`go test` are part of `moon check --all` for exactly
    this reason, and it fired as designed.
  - `listInvitations`' `filterColumn` was widened from `email` alone to
    `[email, username]` so an admin's search box finds a username-only
    invitation too — a small, directly-motivated fix, not scope creep: an
    invitation type the list can't be searched by is a regression relative
    to the email flow it's replacing half of.
  - `orgsInviteCmd`'s Cobra flags are a package-level singleton that
    persists between `Execute()` calls within one test binary run (not
    reset automatically) — three new CLI tests needed explicit
    `Flags().Set(..., "")` resets to avoid a prior test's `--email` value
    leaking into a `--username`-only invocation and tripping the new
    exactly-one check. Recorded because it is exactly the kind of thing a
    future CLI test in this file will rediscover the hard way otherwise.
- **Next**: M13-T10 — admin-driven password reset.

## M13-T10 — Admin-driven password reset

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `packages/shared-contract/main.tsp` + `.../health.proto` +
  regenerated `gen/`, `src/lib/credentials.ts` (`generateTemporaryPassword`),
  `src/lib/credentials.test.ts`, `src/modules/auth/auth.handler.ts`
  (`adminResetPassword`), `src/modules/auth/auth.handler.test.ts`,
  `src/modules/auth/auth.ts` (`PasswordLoginResult` gained
  `mustChangePassword`, surfaced in the login route's JSON body),
  `src/modules/auth/auth.test.ts`, `src/lib/viewer-denial.test.ts`,
  `src/lib/agent-scope-sweep.test.ts`, `apps/gui/scripts/rpc-coverage.mjs`
- **Verified**: `bun test src/modules/auth/` — 94 pass, ~100% coverage.
  Full suite: 738 pass, 0 fail. `bunx knip`, `gui:typecheck`,
  `gui:rpc-coverage` (1 new exception, reasoned), `go build`/`go test`,
  `tsp format --check` all clean.
- **Notes**:
  - **Org-admin-gated, not account-owner-gated** — the one AuthService RPC
    so far that isn't about the caller's own credentials. `orgId` in the
    request makes it exactly the same shape as `updateOrgMemberRole`/
    `removeOrgMember` on `OrgService`: `assertOrgAdmin(db, callerId, orgId)`,
    then an explicit membership check that `userId` actually belongs to
    that org — without the second check, an admin of org A could reset any
    user's password by naming their id under an org they administer, the
    same class of cross-org hole `revokeInvitation` (M03) was written to
    close. Classified in `viewer-denial.test.ts`'s `REQUESTS` (a viewer
    must be denied — unlike `setPassword`/`listLinkedIdentities`/
    `unlinkIdentity`, which stay in `NOT_ORG_SCOPED` since those act on the
    caller's own account regardless of org role).
  - **Login surfaces `mustChangePassword` without blocking the session.**
    A user resetting in with the temporary password still needs a valid
    session to call `setPassword` at all, so `attemptPasswordLogin`'s `ok`
    result now carries the flag (read from the credential row, `false` by
    default) and the login route includes it in the JSON body. GUI routing
    to a forced change-password screen on that flag is T12's job — the
    signal exists now so that task doesn't also have to touch the login
    contract.
  - **`mustChangePassword` is deliberately left untouched by a successful
    login** — only `setPassword` (T06) clears it. Logging in with the
    temporary password is not the same as actually changing it; clearing
    the flag on login would let a compromised temporary password go on
    working indefinitely once used once.
  - **Temporary password**: 12 bytes of CSPRNG output as base64url (16
    chars) via a new `generateTemporaryPassword()` in `lib/credentials.ts` —
    comfortably over `MIN_PASSWORD_LENGTH`, short enough for an admin to
    read aloud or copy-paste once. Returned exactly once, in the RPC
    response, never stored or logged in plaintext — same rule ADR-0008
    applies to an agent token's plaintext, applied here for the same reason.
  - Resetting also clears `failedAttempts`/`lockedUntil` (tested), so a
    reset is a genuine fresh start for a member who was both locked out
    *and* had lost their password, not just a new hash on top of a still-locked row.
- **Next**: M13-T11 — GUI login screen.

## M13-T11 — GUI login screen

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `apps/gui/src/lib/passwordAuth.ts` (new),
  `apps/gui/src/lib/passwordAuth.test.ts` (new),
  `apps/gui/src/features/Auth/{LoginForm,RegisterForm}.tsx` (new),
  `apps/gui/src/features/Auth/{LoginForm,RegisterForm}.test.tsx` (new),
  `apps/gui/src/features/Auth/{LoginForm,RegisterForm}.stories.tsx` (new),
  `apps/gui/src/pages/Login.tsx` (rewritten), `apps/gui/src/pages/Login.test.tsx`
  (rewritten), `apps/gui/src/pages/Register.tsx` (new),
  `apps/gui/src/pages/Register.test.tsx` (new), `apps/gui/src/App.tsx`
  (`/register` route)
- **Verified**: `bunx vitest run src/features/Auth/ src/pages/Login.test.tsx
  src/pages/Register.test.tsx src/lib/passwordAuth.test.ts` — 32 pass. Full
  GUI suite: 673 pass, 97.95%/95.25%/95.93%/98.12% stmt/branch/func/line
  coverage (above the 95% gate on every dimension — two rounds of gap-filling
  tests were needed, see Notes). `gui:typecheck`, `oxlint` (no new
  warnings), `gui:design-lint` (0 findings, 142 files), `gui:rpc-coverage`
  (unaffected — these are HTTP routes, not RPCs), `gui:query-error-coverage`
  (unaffected — these are mutations, not queries) all clean.
- **Notes**:
  - **HTTP helper, not a ConnectRPC client** — `passwordAuth.ts` mirrors
    `authSession.ts`'s shape (`fetch` with `credentials: 'include'` against
    `BACKEND_URL`) rather than `connectTransport`, since `/api/auth/password/
    {login,register}` are plain Elysia routes (T06's own divergence note).
    Non-2xx bodies are parsed as RFC 7807 problem details into a
    `PasswordAuthError` carrying `status` and, for a 429, `retryAfterSeconds`
    from the `Retry-After` header — the form reads both to show a countdown
    on lockout (T07) without re-deriving it.
  - **`features/Auth/` holds the real components; `pages/Login.tsx` and the
    new `pages/Register.tsx` stay thin** — matching this codebase's existing
    split (features hold logic, pages compose and route). `Login.tsx` also
    had `window.location.href` switched from a hardcoded
    `'http://localhost:8080/...'` to the shared `BACKEND_URL` constant while
    touching this file anyway — a real, if small, existing inconsistency
    fixed in passing, tested by name (`Login.test.tsx`'s redirect assertion
    now asserts against `BACKEND_URL`, not a duplicated literal).
  - **`mustChangePassword` is received but not enforced with a redirect
    yet** — `LoginForm` calls `loginWithPassword`, gets a valid session
    either way, and always navigates to `/`. The screen that would act on
    the flag lives in account settings, which is T12. Said plainly in the
    component's own comment so this isn't mistaken for an oversight later.
  - **No shared `Input`/`Label` primitive exists in this design system**
    (ADR-0009/ADR-0011 keep only overlay/nav primitives on Radix; inputs
    stay hand-rolled) — every field uses a real `<label htmlFor>` associated
    input rather than the placeholder-only pattern some older inline-edit
    forms in `Organizations/index.tsx` use, since axe (`expectNoA11yViolations`,
    now run against both new pages and both new forms) requires it and a
    first-class auth surface is exactly the wrong place to inherit a lesser
    pattern.
  - **Coverage gap-filling, not padding**: the first full-suite run landed
    at 94.94% branch coverage against a 95% gate — three real gaps, not
    contrived ones: the guard that ignores a submit event bypassing the
    disabled button (Enter-key submission doesn't respect `disabled`), the
    `mustChangePassword`-only vs `mustChangePassword`-omitted lockout message
    shape, and the pending-state label (`"Signing in…"` /
    `"Creating account…"`) — none of which the initial happy/error-path
    tests exercised. Second pass reached 95.25%/95.93%/98.12%.
  - **Storybook a11y gate (`moon run gui:storybook-test`) run manually,
    observed pre-existing and unrelated to this task**: it timed out
    navigating to `ui-repositories-repositoryintegrationconfig--default`
    (a story this task never touched) with no violation or mention of
    either new `Features/Auth/*` story in the log before the crash. This
    gate is `type: run` (excluded from `moon check --all` and pre-commit
    per M06's note — it needs a real, booted browser), so it did not block
    this commit; flagging the observation rather than silently ignoring it,
    per the same convention M03/M04 handoff notes used for out-of-scope
    findings.
- **Next**: M13-T12 — GUI account settings.

## M13-T12 — GUI account settings (password, link/unlink Google)

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `packages/shared-contract/main.tsp` + `.../health.proto` +
  regenerated `gen/` (`ListLinkedIdentitiesResponse.hasPassword`),
  `apps/backend/src/modules/auth/auth.handler.ts` (`listLinkedIdentities`
  now returns `hasPassword`), `apps/backend/src/modules/auth/auth.handler.test.ts`,
  `apps/backend/src/modules/auth/auth.ts` (`/api/auth/session` now returns
  `mustChangePassword`), `apps/backend/src/modules/auth/auth.test.ts`,
  `apps/gui/src/features/Settings/AccountSettings.{tsx,test.tsx,stories.tsx}`
  (new), `apps/gui/src/pages/SystemHealth.tsx` (+ its test), `apps/gui/src/lib/authSession.ts`
  (+ test), `apps/gui/src/hooks/useAuthSession.ts` (+ test),
  `apps/gui/src/components/auth/ProtectedRoute.tsx` (+ test),
  `apps/gui/scripts/rpc-coverage.mjs` (3 exceptions resolved, 1 corrected)
- **Verified**: `bun test src/modules/auth/` — 98 pass. Full backend suite:
  746 pass, 0 fail. `bunx vitest run --coverage` — 691 pass,
  97.9%/95.05%/96%/98.16% stmt/branch/func/line (above the 95% gate on
  every dimension). `gui:typecheck`, `oxlint`, `gui:design-lint` (0
  findings, 145 files), `gui:rpc-coverage` (**100 of 103 RPCs now
  reached**, up from 97 — this task's own three RPCs stopped needing their
  T06/T08/T10 exceptions), `gui:query-error-coverage` (13 reading views,
  unaffected), `go build`/`go test`, `tsp format --check` all clean.
- **Notes**:
  - **Two backend gaps discovered and closed, not deferred** — both
    necessary for the milestone's own exit criteria, outside T12's literal
    Files list:
    1. **`ListLinkedIdentitiesResponse` gained `hasPassword: boolean`.**
       The exit criterion is explicit: "the last-method guard surfaced
       before the action is attempted, not only as a server error after."
       Disabling an "Unlink" button pre-emptively needs to know whether a
       password exists, not just how many identities are linked — nothing
       exposed that. Added on the response this exact screen already
       calls, not on `User`, since it's this screen's concern specifically.
    2. **`GET /api/auth/session` gained `mustChangePassword: boolean`.**
       `mustChangePassword` (M13-T10) was previously returned only once, in
       the login response body — a page reload lost it entirely, so
       `ProtectedRoute` had no durable signal to redirect on. Extended the
       session-status endpoint (already polled by `useAuthSession`, so no
       new round trip) rather than `GetIdentityResponse`, since this is
       session state, not identity data.
  - **`ProtectedRoute` now redirects to `/settings` whenever
    `mustChangePassword` is true**, guarded against redirecting away from
    `/settings` itself (no loop). This is the enforcement T11's `LoginForm`
    comment explicitly deferred to this task.
  - **`AccountSettings` lives in `features/Settings/` and is rendered as a
    new section inside the existing `/settings` route** (`SystemHealthPage`),
    not a new route — that page already carries the layout scaffold and the
    milestone's own Files hint pointed at `features/Settings/`, not a new
    page.
  - **The last-method guard is genuinely pre-emptive, not just styled to
    look that way**: `totalMethods = identities.length + (hasPassword ? 1
    : 0)`; "Unlink" is `disabled` with a `title` explaining why whenever
    `totalMethods <= 1`, computed from data already on screen — no click,
    no server round trip, no error message needed to discover the
    constraint. `unlinkIdentity` itself is still guarded server-side
    (T08) as defense in depth.
  - **A real, corrected gap, recorded rather than silently left wrong**:
    T10's `gui:rpc-coverage` exception for `adminResetPassword` had assumed
    its GUI caller would land "in M13-T12, alongside the other new auth
    surfaces" — it doesn't. T12's actual scope (confirmed against the
    milestone doc) is self-service only; nothing in M13's 15 tasks wires
    an admin-facing reset into the Organizations member list. The
    exception's reason was rewritten to say so plainly, rather than
    quietly renewing a since-falsified assumption. `setPassword`/
    `listLinkedIdentities`/`unlinkIdentity`'s exceptions were removed —
    genuinely resolved.
  - **`ConfirmDialog`'s `useConfirm()` is reused for unlinking**, matching
    `Organizations/index.tsx`'s existing pattern (`destructive: true`,
    `undo` names the actual recovery path — "You can link X again from
    this screen" — since unlinking is reversible, unlike most of that
    hook's other call sites).
- **Next**: M13-T13 — CLI username/password login.

## M13-T13 — CLI username/password login

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `apps/cli/cmd/auth.go` (`loginWithPassword`, `promptSecret`,
  `readLine`, `runPasswordLogin`, `setPasswordCmd`, `--username`/
  `--password`/`--current-password`/`--new-password` flags on `loginCmd`/
  `setPasswordCmd`), `apps/cli/cmd/auth_test.go`, `apps/cli/go.mod`/`go.sum`
  (`golang.org/x/term` added, direct), `.specs/product/tech-stack.md`
- **Verified**: `go build ./...`, `go vet ./...`, `gofmt -l .` (clean),
  `go test ./...` — full CLI suite green, `cmd` package in ~1.2s (see the
  flaky-test story in Notes). `moon run :spec-drift` clean after `go mod
  tidy` promoted `golang.org/x/term` to a direct dependency. **Real
  end-to-end run against a live backend, `ENABLE_TEST_LOGIN` unset**,
  matching M04's verification bar exactly: registered a fresh local user
  with no email at all via `POST /api/auth/password/register`, then ran
  the actual built CLI binary —
  `tasker auth login --username e2e-cli-user --password ...` → saved a
  working session token extracted from `Set-Cookie` → `tasker auth whoami`
  resolved the identity → `tasker auth set-password` changed the password
  → logging in with the *old* password then failed
  (`The username or password is incorrect.`, exit 1) while the *new* one
  succeeded.
- **Notes**:
  - **One new CLI dependency, justified and recorded**: `golang.org/x/term`,
    for a masked (non-echoing) password prompt — not a stdlib one-liner
    cross-platform, so it clears `dependency-standard.md`'s minimalism bar
    on its own merits. Added to `tech-stack.md`'s CLI table with a reason,
    verified against `moon run :spec-drift`.
  - **`loginCmd` grew `--username`/`--password` rather than becoming a
    second command** — `--username` alone selects the local-account path
    entirely (Google login never takes flags), matching `orgs invite`'s
    established one-command-two-paths pattern from T09 rather than a new
    verb.
  - **The session token lives only in `Set-Cookie`, not the JSON body** —
    confirmed against the real backend, not assumed: `loginWithPassword`
    reads it via `res.Cookies()`, the same parsing `net/http` already does
    for you, and errors explicitly if a 200 response carries no `session`
    cookie at all rather than silently saving an empty token.
  - **Added `auth set-password`, beyond T13's literal scope, to close a
    real gap**: without it, a CLI-only user — registered locally, or
    handed a `mustChangePassword` temporary password by an admin — would
    have no way to ever change their password; the GUI's equivalent
    (`AccountSettings.tsx`, T12) has no CLI counterpart otherwise. Uses
    `AuthService.SetPassword` directly, the same client-construction
    pattern `whoamiCmd` already established.
  - **A real bug, found and fixed by the second test-run, not a flaky
    test worked around**: a new test (`...WhenThePromptYieldsNone`) first
    read as environment flakiness — 30s in the full suite, instant alone —
    but the actual cause was a genuine defect in the *test*, not the
    environment: `loginCmd`'s `--password` flag is a package-level Cobra
    singleton that persists across `Execute()` calls (the exact hazard
    T09's `orgs_test.go` notes already flagged), so an earlier test's real
    password leaked in, skipped the empty-password guard entirely, and the
    command made a real network call the test never intended. Diagnosed by
    swapping the "unreachable address" assumption for an `httptest` server
    that asserts it was *never called* — which failed loudly instead of
    merely timing out — then fixed with the same explicit `Flags().Set(...,
    "")` reset T09 already established as the house pattern for this
    class of leak. Also extracted `readLine` as a pure function so the
    non-terminal stdin fallback is unit-testable against a
    `strings.Reader` instead of the real (environment-dependent, possibly
    blocking) `os.Stdin`.
- **Milestone-level checkpoint**: 13/15 tasks done. Remaining: T14
  (security review of the full credential path) and T15 (exhaustive auth
  test matrix), both verification-only — no new behavior, gating the
  close.

## M13-T14 — Security review of the full credential path

- **Status**: done
- **Date**: 2026-08-16
- **Changed**: `apps/backend/src/modules/auth/auth.ts` (invitation-consumption
  fix, `requireJsonContentType` + both password routes), `auth.test.ts` (2
  new regression describe blocks),
  `.milestones/MILESTONE-13-local-accounts-and-linked-identity/reviews/SECURITY-REVIEW-v1.md`
  (new)
- **Verified**: Multi-agent review per `/security-review`'s own protocol —
  one agent read the full credential path and produced 4 candidate
  findings; each was independently re-verified by a second agent scoring
  1–10. Two cleared the ≥8 bar and were fixed; two scored 2/10 and are
  recorded as checked-but-not-actionable in the review file, not silently
  dropped. `bun test src/modules/auth/` — 103 pass, 99.75% line coverage.
  Full backend suite: 751 pass, 0 fail. `bunx knip` clean. GUI/CLI
  unaffected (both already send `application/json`) — spot-checked GUI
  auth tests (27 pass) rather than re-running the full suite for a
  backend-only change.
- **Notes**:
  - **Vuln 1 (High, confidence 9/10) — invitation hijack via unverified
    email, fixed.** `registerLocalUser` no longer passes its caller-typed
    `email` to `consumePendingInvitations`; local registration now only
    ever auto-joins via a **username**-targeted invitation (the identifier
    the registrant just proved control of by claiming it). An
    email-targeted invitation is consumable only through Google OAuth,
    where the email is provider-verified. This was a real gap the milestone's
    own test suite proved end-to-end (`auth.test.ts`'s original "consumes a
    pending email invitation on local registration" test), rewritten to
    assert the fixed behavior, plus a new test confirming the Google path
    still works.
  - **Vuln 3 (Medium, confidence 8/10) — login CSRF via form-encoded POST,
    fixed.** Both password routes now call `requireJsonContentType(request)`
    before touching the body, returning `415` for anything but
    `application/json` (with or without a charset parameter). This closes
    the plain-`<form>` vector outright (form submissions can't set
    `application/json`) and forces any genuine cross-origin JS caller
    through a real CORS preflight, bringing it back under the existing
    origin allowlist. Verified: the same class of protection the
    pre-existing Google OAuth flow already had via its `oauth_state` nonce
    — this closes the gap between the two paths rather than inventing a
    new mechanism.
  - **Two findings checked and NOT fixed, with reasons recorded rather
    than silently dropped** (both confidence 2/10 on independent
    re-verification): a timing side-channel between "unknown username"
    and "wrong password" (real, but `registerLocalUser`'s "username
    already taken" response already gives a zero-noise oracle for the same
    information, per this milestone's own ADR-0012, so mitigating the
    weaker channel first would be backwards); and CLI flags accepting
    passwords in plaintext (real, but consistent with this codebase's
    existing `--token` precedent on every command, and the masked prompt
    is the default when the flag is omitted).
  - This is the first task in this milestone where the review process
    itself found something to fix, not just documented a decision — both
    fixes are small, targeted, and land with their own regression tests
    rather than a broad rewrite, matching the review's own instruction to
    minimize false positives and act only on high-confidence findings.
- **Next**: M13-T15 — exhaustive auth-path test matrix; then close M13.
