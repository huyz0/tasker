---
id: M13
title: Local Accounts & Linked Identity
status: in-progress
goal: A user can exist, be invited and log in entirely on a local username and password with no email address and no dependency on any external provider; Google becomes one optional linked identity per account rather than the account itself, and the system always keeps at least one active sign-in method per user.
depends_on: [M01, M03]
surfaces: [backend, gui, cli, contract]
exit_criteria_met: false
started_at: 2026-08-16
completed_at: null
---

# M13 — Local Accounts & Linked Identity

## 1. Goal

Today `users.id` *is* the caller's Google profile id, `email` is required, and
there is no way to exist in this product without a Google account. This
milestone splits "who the user is" from "how the user proves it": a user is a
local identity (`username`, optionally `email`) that can authenticate with a
locally-stored password, an external provider, or both — the same relationship
a Windows machine has with a local account versus a linked Microsoft account.
Either credential can be added or removed independently; the system refuses to
remove the last one standing.

## 2. Why Now

This is the identity foundation everything else in IAM sits on. M03 made the
current org/role/invitation model correct and M10 (queued next) makes roles
and grants data-driven — both assume `users` rows exist and are addressable,
but neither assumes *how* a user authenticates. Doing this now, before M10,
means the team/role/grant model M10 builds is designed against a user model
that already tolerates no-email, non-Google accounts, instead of retrofitting
it later against ~90 authorization call sites a second time. It does not block
M10 technically (grants and teams key on `userId`, not on how the user logged
in) — the two are sequenced in this order because the product priority named
it first, not because of a hard dependency.

## 3. Exit Criteria

- [ ] A user can be created with only a username and password — no email, no
      Google identity — and can subsequently log in with that password.
- [ ] `users.email` is nullable in both schema dialects and no backend path
      requires it to be present.
- [ ] A user can link a Google identity to an existing local account and later
      unlink it; the system refuses to remove the last remaining sign-in
      method (password or any linked identity) for any user.
- [ ] Password login is hashed with argon2id, rate-limited per identity and
      per source, and locks out after repeated failures — proven by a test
      that floods login attempts and observes the lockout and its expiry.
- [ ] An invitation can target a username as well as an email, and acceptance
      on first login/registration works for both.
- [ ] The GUI offers both "Sign in with Google" and username/password on
      login, and account settings exposes linking, unlinking and password
      change with the last-method guard visible before it is hit.
- [ ] Every user who could log in via Google before this milestone can still
      do so afterward with no re-consent and no id change — proven by an
      integration test against pre-migration fixture data.

## 4. Scope

**In Scope**: password credential storage and hashing, a generalized linked
external-identity model (provider + provider user id) that Google is migrated
onto rather than special-cased, login/registration/link/unlink RPCs,
username-based invitations, session issuance convergence for both paths, GUI
login and settings surfaces, CLI username/password login, rate limiting and
lockout, admin-driven password reset for members with no recovery email.

**Out of Scope**: additional external providers beyond generalizing Google
onto the new model (no GitHub/Microsoft login added here); SSO/SAML; MFA/2FA
(the linked-identity table is shaped to add it later without another
migration, but no second factor ships in this milestone); self-service
password reset over email for accounts that do have one (**M13 follow-up or
M11**, since it needs outbound email delivery this repo does not yet have).

## 5. Task Breakdown

### Decide and model

- [x] **M13-T01** — Write the ADR choosing local password credentials plus a
      generalized linked-identity model over the current Google-only design;
      name the hashing algorithm and parameters, the migration path for
      existing users, and the "at least one active sign-in method" invariant.
      - Files: `.specs/adr/ADR-0012-local-password-auth-and-linked-identities.md`
      - Verify: the ADR states the invariant, the hashing parameters, and a
        rollback position.

- [ ] **M13-T02** — Make `users.email` nullable and add a required, unique
      `users.username` as the stable local handle, in both dialects.
      - Files: `db/schema.sqlite.ts`, `db/schema.mysql.ts`, `drizzle-sqlite/`,
        `drizzle-mysql/`
      - Verify: migrations apply and roll forward on both dialects; existing
        rows are backfilled with a derived, de-duplicated username.

- [ ] **M13-T03** — Add `password_credentials` (`userId` PK/FK, `passwordHash`,
      algorithm/cost params, `updatedAt`, `failedAttempts`, `lockedUntil`,
      `mustChangePassword`) and `linked_identities` (`id`, `userId` FK,
      `provider`, `providerUserId`, `linkedAt`, unique on
      `(provider, providerUserId)`) to both dialects.
      - Files: `db/schema.sqlite.ts`, `db/schema.mysql.ts`, `drizzle-sqlite/`,
        `drizzle-mysql/`
      - Verify: migrations apply; the unique constraint is exercised by a test
        that tries to link the same Google id to two accounts.

- [ ] **M13-T04** — Migrate existing users: for every current row (whose id is
      today's Google profile id), insert a `linked_identities` row
      (`provider='google'`, `providerUserId=users.id`); `users.id` itself does
      not change, so no other foreign key in the schema needs touching.
      - Files: `drizzle-sqlite/00xx_linked_identity_backfill.sql`,
        `drizzle-mysql/00xx_linked_identity_backfill.sql`
      - Verify: post-migration, every pre-existing fixture user still logs in
        via Google unchanged (integration test).

### Enforce / backend

- [ ] **M13-T05** — Password hashing module: argon2id hash/verify, a versioned
      parameter set so a future cost bump can still verify old hashes, and a
      timing-safe comparison path.
      - Files: `apps/backend/src/lib/credentials.ts`, `credentials.test.ts`
      - Verify: unit tests for hash/verify round-trip and for verifying a hash
        produced under an older parameter version.

- [ ] **M13-T06** — Add `loginWithPassword`, `registerLocalUser`, and
      `setPassword`/`changePassword` RPCs; extend `completeLogin` so Google
      OAuth and password login converge on the same session issuance path.
      - Files: `main.tsp`, `apps/backend/src/modules/auth/auth.handler.ts`,
        `apps/backend/src/modules/auth/auth.ts`
      - Verify: an integration test registers and logs in a user with no
        email and no linked identity at all.

- [ ] **M13-T07** — Rate limit and lock out password login: bounded attempts
      per account and per source with exponential backoff, using a bounded,
      correctly-evicting bucket store (per the M04 lesson: LRU eviction under
      flood evicts the genuine credential, not the attacker's).
      - Files: `apps/backend/src/lib/loginRateLimiter.ts`,
        `apps/backend/src/index.ts`
      - Verify: a flood test trips the lockout and a correct login succeeds
        again only after the cooldown.

- [ ] **M13-T08** — Add `linkIdentity` / `unlinkIdentity` RPCs generalizing
      "Google login" into "a linked identity provider"; refuse unlinking the
      last remaining sign-in method or clearing the password when it is the
      only method left.
      - Files: `main.tsp`, `apps/backend/src/modules/auth/auth.handler.ts`,
        `apps/backend/src/lib/authz.ts`
      - Verify: unlinking the sole remaining method is rejected; the same call
        succeeds once a second method exists.

- [ ] **M13-T09** — Rework invitation acceptance to key on username or email:
      `invitations.username` as a nullable alternate key to `email`;
      registration and `completeLogin` both consume a matching pending invite.
      - Files: `apps/backend/src/modules/orgs/orgs.handler.ts`,
        `apps/backend/src/modules/auth/auth.ts`, `db/schema.*.ts`, `main.tsp`
      - Verify: inviting a bare username with no email, then registering
        locally with that username, joins the org at the invited role.

- [ ] **M13-T10** — Admin-driven password reset for members with no recovery
      email: an admin-gated RPC that issues a one-time temporary password and
      sets `mustChangePassword`.
      - Files: `apps/backend/src/modules/auth/auth.handler.ts`,
        `apps/backend/src/lib/authz.ts`, `main.tsp`
      - Verify: after an admin reset, the old password fails and the temp
        password forces a change on next login.

### Surface

- [ ] **M13-T11** — GUI login screen: a username/password form alongside the
      existing "Sign in with Google" button, and a registration path for a
      local account.
      - Files: `apps/gui/src/features/Auth/`
      - Verify: e2e login as a local user with no Google identity at all.

- [ ] **M13-T12** — GUI account settings: change password, link/unlink Google,
      with the last-method guard surfaced before the action is attempted, not
      only as a server error after.
      - Files: `apps/gui/src/features/Settings/`
      - Verify: e2e sets a password, unlinks Google, then confirms the unlink
        control is disabled (with a reason) once only one method remains.

- [ ] **M13-T13** — CLI `login --username` path alongside the existing
      token/Google flow.
      - Files: `apps/cli/cmd/auth.go`
      - Verify: CLI logs in with username/password against a backend started
        with `ENABLE_TEST_LOGIN` unset, mirroring the M04 verification
        pattern.

### Verify end-to-end

- [ ] **M13-T14** — Security review of the full credential path — hashing,
      storage, rate limiting, lockout, session issuance, admin reset — before
      the milestone closes.
      - Files: `.milestones/MILESTONE-13-local-accounts-and-linked-identity/reviews/SECURITY-REVIEW-v1.md`
      - Verify: `/security-review` run against the branch; every critical or
        high finding resolved or explicitly accepted with a reason.

- [ ] **M13-T15** — Exhaustive auth-path test matrix: local-only, Google-only,
      both-linked, invited-by-username, invited-by-email, lockout, admin
      reset; extend the deny-by-default RPC sweep to the new endpoints.
      - Files: `apps/backend/src/modules/auth/auth.test.ts`,
        `apps/backend/src/lib/viewer-denial.test.ts`
      - Verify: the matrix is generated, not hand-written, and passes in full.

## 6. Verification

```bash
moon run backend:test
moon run gui:test gui:e2e
moon run cli:test
```

## 7. Risks

Second only to M10 in how much of the authorization surface it touches, and
the one most likely to introduce a credential-handling regression rather than
an authorization one. `users.id` staying stable through the migration is the
load-bearing decision that keeps this from becoming a second M10-sized
rewrite: every other table's `userId` foreign key needs no change. Mitigate by
never allowing the last-sign-in-method check to be bypassed (test it from both
the password-clear and the unlink direction, not just one), and by running the
security review (M13-T14) as a real gate before close, not a formality — this
is the milestone that stores a secret for the first time anywhere in this
codebase's `users` surface.
