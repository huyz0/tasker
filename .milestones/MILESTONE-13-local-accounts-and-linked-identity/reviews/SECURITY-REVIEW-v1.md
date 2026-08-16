---
timestamp: 2026-08-16T23:00:00Z
decision: approved
---

# M13 — Security review of the credential path

Multi-agent review: one agent read the full credential path (schema,
migrations, `credentials.ts`, `authz.ts`, `auth.ts`, `auth.handler.ts`,
`orgs.handler.ts`, `index.ts`, the GUI auth screens, `apps/cli/cmd/auth.go`)
against ADR-0012 and `security-standard.md` and produced four candidate
findings. Each was independently re-verified by a second agent instructed to
apply the same false-positive filters `/security-review` uses generally,
scored 1–10. Two findings cleared the ≥8 bar; two did not and are not
reported further below (their rationale is kept here for the record, not
because they're findings).

## Findings

```yaml
- file: apps/backend/src/modules/auth/auth.ts
  line: 256
  severity: High
  category: authorization
  comment: >
    registerLocalUser (M13-T06) accepted an arbitrary, self-asserted `email`
    with no ownership proof, then called consumePendingInvitations with that
    email — matching and consuming an email-targeted invitation and granting
    org membership at the invited role. Every other path that ever populated
    users.email (Google OAuth) got it from a provider-verified profile;
    local registration is the first path in this codebase's history where
    email is untrusted. Confirmed exploitable and confirmed as new behavior
    (pre-M13, there was no way to create a users row with a self-typed
    email at all) by an independent verification pass reading the pre-M13
    diff and the project's own test suite: auth.test.ts's "consumes a
    pending email invitation on local registration" test proved the full
    chain end to end, including granting an admin-role invitation.
  verdict: CONFIRMED (confidence 9/10)
- file: apps/backend/src/modules/auth/auth.ts
  line: 568
  severity: Medium
  category: csrf
  comment: >
    POST /api/auth/password/login and /register (unauthenticated by
    necessity) declared no body schema, so Elysia's content-type-driven
    parser accepted application/x-www-form-urlencoded bodies — a "simple"
    content type that never triggers a CORS preflight. A plain, auto-
    submitting cross-site HTML form could log a visiting victim into (or
    register them into) an attacker-chosen account; the resulting
    Set-Cookie is honored regardless of origin (SameSite=Lax blocks the
    cookie being *sent* cross-site later, not it being *set* by this
    response). Verified against the actual Elysia source and the request
    dispatcher in index.ts (no Origin/Content-Type gate anywhere on this
    path); confirmed as a regression relative to this codebase's own
    standard, since the pre-existing Google OAuth flow has explicit,
    tested state/nonce CSRF protection the new routes lacked entirely.
    Compounding risk specific to this app: a victim confused into the
    attacker's session who then uses "Link Google account" durably links
    their real Google identity to the attacker's account.
  verdict: CONFIRMED (confidence 8/10)
```

**Not reported** (verified, below the ≥8 confidence bar — recorded for
traceability, not as accepted risk requiring tracking):

- **Timing side-channel between "unknown username" and "known username,
  wrong password"** in `attemptPasswordLogin` (`auth.ts`) — real and
  measurable (argon2id only runs on the known-username path), but ADR-0012
  already names timing attacks as an accepted new attack surface, and
  `registerLocalUser`'s "username is already taken" response already gives
  an attacker a zero-noise, one-request username-existence oracle that
  strictly dominates a statistical timing attack against `/login`. Verified
  confidence 2/10 — not worth mitigating ahead of that stronger, already-
  accepted oracle.
- **Passwords accepted via CLI flags** (`apps/cli/cmd/auth.go`'s
  `--password`/`--current-password`/`--new-password`) — real, but this repo
  already has an established, broader precedent (`--token` on every
  command, `root.go`), the insecure path is opt-in (a masked prompt is the
  default when the flag is omitted), and the class of exposure (process
  list / shell history) is the accepted CLI baseline this project already
  ships elsewhere. Verified confidence 2/10.

## Fixes applied (this review, before close)

1. **Vuln 1** — `registerLocalUser` no longer consumes an email-targeted
   invitation. Local registration only auto-joins via a **username**-
   targeted invitation (the identifier the registrant actually chose and
   proved control of by registering it); an email-targeted invitation is
   now consumable only through the Google OAuth path, where the email is
   provider-verified. `consumePendingInvitations`'s docstring and the
   affected test (`auth.test.ts`) were updated to state this as the rule,
   not a coincidence.
2. **Vuln 3** — `/api/auth/password/login` and `/register` now reject any
   request whose `Content-Type` is not `application/json` with a `415`
   problem-details response, before the body is read. A non-JSON
   content-type is exactly what a plain HTML form submits and exactly what
   forces a real cross-origin `fetch`/`XHR` through a CORS preflight — so
   this closes the plain-form vector outright and brings the JS vector back
   under the existing origin allowlist. A test asserts both routes reject a
   form-encoded POST and accept a JSON one.

Both fixes are verified — full backend suite green, new regression tests
for each finding (see auth.test.ts's "does not consume an email-targeted
invitation on local registration, only username" and "rejects a
non-JSON Content-Type" cases).
