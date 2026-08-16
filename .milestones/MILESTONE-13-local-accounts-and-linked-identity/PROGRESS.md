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
