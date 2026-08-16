---
id: ADR-0012
status: accepted
date: 2026-08-16
milestone: M13
---

# Users get a local username/password credential; Google becomes one linked identity among possibly several, not the account itself

## Context

Today `users.id` *is* the caller's Google `sub` (profile id), `users.email`
is `NOT NULL`, and there is no path into this product that does not start
with a Google OAuth consent screen. `completeLogin`
(`apps/backend/src/modules/auth/auth.ts`) upserts a `users` row keyed by that
Google id and, in the same transaction, resolves any pending `invitations`
row whose `email` matches. Every "who is this member" surface in the GUI
falls back to that email when the person has never logged in.

M13 needs a user to exist and authenticate with nothing but a locally chosen
username and password — no email, no Google account, no dependency on an
external identity provider being reachable at all. Google does not go away;
it becomes optional, and a user should be able to attach or detach it from an
existing account independently of their password, the way a Windows machine
has one local account that can optionally be linked to a Microsoft account —
neither owns the other, and removing the link does not delete the machine
account.

Everything downstream in this milestone encodes the choices below — the
schema (T02, T03), the migration (T04), the credential module (T05), the
login/link/unlink RPCs (T06, T08), the invitation rework (T09) and the
last-method guard exercised across T08/T10/T15 — so they are decided once,
here.

Constraints already in place:

- `bun:sqlite` and MySQL are both supported; anything chosen must work on
  both, per `dependency-standard.md` and this repo's existing dual-dialect
  schema files.
- No new dependency without justification (`AGENTS.md`, `dependency-standard.md`
  §2: "prefer stdlib or local-utils; reject dependencies for trivial tasks").
- ADR-0008 already set the precedent for this repo's approach to secret
  storage (agent tokens: opaque random secret, SHA-256, chosen specifically
  *because* the secret is high-entropy and a slow hash would only add a DoS
  surface). A user password is the opposite case — low-entropy, human-chosen,
  guessable offline — so that ADR's reasoning argues *for* a slow hash here,
  not against one. This ADR does not reverse ADR-0008; it names the other
  side of the same tradeoff.
- M03 established deny-by-default authorization sweeps
  (`viewer-denial.test.ts`) and M04 extended the pattern
  (`agent-scope-sweep.test.ts`). Any new RPC this milestone adds must be
  classified by both, or a new sweep in the same spirit (T15).

## Options

### 1. What identifies a user, once email is optional

**Add a required, unique `users.username` as the stable local handle; keep
`email` as optional and, when present, unique** (chosen). A user always has
exactly one username, assigned at account creation (locally, by an admin, or
derived from the external profile on first federated login) and changeable
later like any other profile field, not like a primary key.

**Keep `users.id` as the only identifier and drop email entirely** (rejected)
— `id` today *is* the Google `sub`, an opaque string with no meaning to a
human. Every list, search box and audit log needs something a person
recognizes, and reusing `id` for that purpose (letting a local user "log in
with their id") reintroduces exactly the coupling this milestone removes:
the identifier a person types would have to become memorable, which means it
stops being safe to treat as opaque.

**Make email required but system-generated (`user-<id>@local.invalid`) so
existing NOT NULL constraints and code paths need no change** (rejected) —
this is the "delete it by faking it" option. It would keep `email` load
-bearing in disguise (still unique, still displayed, still what invitations
match against) while pretending the requirement was removed. Nothing that
reads `email` today should keep meaning "this is how the person is
addressed"; a fake address would silently violate that at the first place
someone actually emails it.

### 2. How a user is identified across authentication paths

**A generalized `linked_identities` table** — `(id, userId, provider,
providerUserId, linkedAt)`, unique on `(provider, providerUserId)` — with
Google migrated onto it as the first (and, for this milestone, only)
provider row type (chosen). `users.id` stays a stable internal identifier
that authentication methods point *at*, rather than one of them *being* it.

**Keep `users.id` as the Google id, and bolt password auth onto the same
row** (rejected) — this is the shape that got us here. It works only as long
as every user has exactly one authentication method for the rest of the
product's life. The moment a Google-only user wants a password too, or a
local-only user wants to link Google, there is no second slot: `id` cannot
simultaneously be "the Google sub" and "an internal id a password credential
also points at" without collision risk (a locally-chosen id could coincide
with a real Google sub, however unlikely).

**A single `auth_method` enum column on `users` (`'google' | 'password'`)**
(rejected) — this forecloses exactly the feature being asked for: a user
with *both* a password and a linked Google account, or a user who links a
second provider later without a schema change. A join table costs one extra
query on the login path and buys arbitrary future providers for free.

### 3. Migrating existing rows without touching every foreign key

**`users.id` does not change. Every existing row gets one new
`linked_identities` row: `provider='google'`, `providerUserId = users.id`**
(chosen, T04). Every other table's `userId` foreign key — `organization_members`,
`projects.ownerId`, `tasks.createdBy`, `api_tokens`, all of it — needs no
migration at all, because the value they already point at does not move.

**Mint a new internal id for every user and re-point every foreign key**
(rejected) — the "textbook correct" version of decoupling identity from a
specific provider's id format. Rejected because it turns a additive,
low-risk migration into a second M10-sized rewrite (that milestone's own ADR
notes it replaces ~90 call sites; this option would touch every table with a
`userId` column instead, for a purely cosmetic gain — nothing downstream
cares that today's ids happen to look like Google subject identifiers).

### 4. Password hashing

**`Bun.password` with `argon2id`** (chosen) — built into the Bun runtime
already pinned by `.prototools` (no new `package.json` dependency, satisfying
`dependency-standard.md` §2's minimalism rule outright rather than by
argument). `Bun.password.hash()` returns a self-describing PHC-format string
(`$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`) that carries its own
algorithm and cost parameters, so `Bun.password.verify()` can always check a
hash produced under older parameters without a separate "version" column —
raising the cost factor later is a config change, not a migration.

**`bcrypt`** (rejected) — would be a new dependency for something the
runtime already provides, and bcrypt's 72-byte input truncation and older,
less memory-hard design is strictly worse against modern GPU cracking than
argon2id for an equivalent parameter budget.

**`node:crypto` `scrypt` by hand** (rejected) — no dependency either, but
requires hand-rolling the parameter-versioning and constant-time-compare
logic that `Bun.password` already does correctly, for no advantage over
calling the built-in.

**SHA-256, following ADR-0008's precedent exactly** (rejected, and the
option ADR-0008's reasoning itself rules out). ADR-0008 chose a fast hash
*because* the agent-token secret is 256 bits of CSPRNG output with no
feasible offline attack. A user password is the opposite: low-entropy,
frequently reused, dictionary-guessable. A fast hash on a stolen
`password_credentials` table turns "the database leaked" into "every
reused, dictionary password is recovered within hours." The two ADRs are
not in tension; they are the same cost-benefit argument reaching opposite
conclusions because the inputs differ.

### 5. The "at least one active sign-in method" invariant

**Enforced at the RPC layer, symmetrically from both directions** (chosen).
`unlinkIdentity` counts the caller's remaining linked identities plus
whether a `password_credentials` row exists and is not disabled; it refuses
if the result would be zero. `changePassword`/`clearPassword` and any future
"disable password login" action perform the same count from the other
direction. Mirrors this repository's existing "cannot remove an
organization's last owner" pattern in
`apps/backend/src/modules/orgs/orgs.handler.ts` — a familiar shape, not a
new kind of check.

**Enforced only at the database layer (a constraint or trigger)** (rejected)
— SQLite and MySQL diverge enough in trigger syntax that this repo has
consistently kept business invariants in the handler layer and used the
database only for structural constraints (uniqueness, foreign keys); see the
transaction-semantics notes in M03's `PROGRESS.md` for why cross-dialect
triggers are a hazard here specifically (`db.transaction` already behaves
differently between the two drivers).

**Not enforced; document it as an operational expectation** (rejected) — a
locked-out user with zero working credentials has no self-service recovery
path in this milestone (no outbound email yet, see Scope). This is the one
invariant this milestone cannot ship without and still call the feature
usable, so it is enforced, not merely documented.

## Decision

`users.email` becomes nullable; a new required, unique `users.username`
becomes the stable local handle. A new `linked_identities` table generalizes
"how a user proves who they are via a third party," and the current
Google-only login is migrated onto it as its first row type, with `users.id`
left unchanged so no other table's foreign key needs to move. A new
`password_credentials` table holds one optional local credential per user,
hashed with `Bun.password`'s `argon2id` (no new dependency). Every RPC that
would remove a user's last working sign-in method — unlinking the only
linked identity, or clearing a password that is the only credential — is
refused, enforced at the handler layer following this repo's existing
last-owner-removal pattern.

## Consequences

**Easier.** A user can exist with nothing but a username and password,
satisfying the milestone's stated goal directly. Linking or unlinking Google
becomes an additive row operation with no effect on the user's other
credential. Future providers (GitHub, Microsoft, SAML) are new
`linked_identities` rows, not new columns or a rewrite of `completeLogin`.
Password cost parameters can be raised later — `Bun.password.verify()` reads
them from the stored hash — without a migration or a dual-read window.

**Harder.** Every path that used to assume "a user has an email" — the M03
member picker's search-by-email, the invite-by-email flow, any place that
displays `user.email` as a fallback label — now needs a username fallback or
an explicit "no email on file" state. `completeLogin` grows a second entry
point (`loginWithPassword`) that must converge on the same session-issuance
code the existing Google path uses, or the two will drift. Password login
adds a genuinely new attack surface (credential stuffing, timing attacks,
online guessing) that Google-only auth never had in this product, which is
why rate limiting/lockout (T07) and a dedicated security review (T14) are
tasks in their own right rather than folded into the login RPC task.

**Foreclosed, deliberately, for this milestone.** Self-service password
reset over email — a user with no email on file has no channel for it, and
building it only for the subset who do have one would ship two different
recovery experiences for the same feature; the admin-driven reset (T10) is
the interim path. MFA/2FA — the `linked_identities` shape leaves room for a
future "second factor" concept, but none ships here. Providers beyond
Google — the model generalizes to arbitrary providers, but no second
provider integration is built in this milestone; adding one later is
additive rows and RPCs, not a schema change.

## Rollback

Because `users.id` is untouched (Option 3) and every new table is additive,
reverting this ADR at the schema level is a drop of three tables
(`password_credentials`, `linked_identities`, plus the `username` column) and
a re-tightening of `email` back to `NOT NULL` — no other table's foreign key
was ever repointed, so nothing downstream needs a second migration to
recover. The harder-to-reverse part is behavioural, not structural: once a
user has registered with no email at all, un-shipping this feature means
that account has no login path until one is added by hand. If that scenario
occurs before this ADR is superseded, treat it as a data-migration problem
scoped to however many such accounts exist, not a reason to have avoided the
feature.
