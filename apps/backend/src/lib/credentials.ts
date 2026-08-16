/**
 * Local password credentials (ADR-0012 §4): `Bun.password`'s built-in
 * `argon2id`, chosen specifically because a user password is the opposite
 * case from an agent token (ADR-0008) — low-entropy, human-chosen,
 * dictionary-guessable — so a slow, memory-hard hash is the correct
 * tradeoff here where it was the wrong one there.
 *
 * `Bun.password.hash()` returns a self-describing PHC-format string
 * (`$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>`) that carries its own
 * algorithm and cost parameters. That is why this module has no "version"
 * concept of its own: `Bun.password.verify()` reads the parameters back out
 * of the stored string, so raising Bun's default cost later (or this
 * module choosing to override it) verifies old hashes exactly as it did
 * before — no migration, no dual-read window.
 *
 * No new dependency: `Bun.password` ships with the Bun runtime this repo
 * already pins in `.prototools`, satisfying `dependency-standard.md` §2's
 * minimalism rule by not needing an argument for it.
 */

import { randomBytes } from 'node:crypto';

const ALGORITHM = 'argon2id';

/**
 * Hashes a plaintext password. The result is what `password_credentials.
 * password_hash` stores — never the plaintext, never anywhere else.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return Bun.password.hash(plaintext, { algorithm: ALGORITHM });
}

/**
 * Verifies a plaintext against a stored hash. `Bun.password.verify` is
 * constant-time over the comparison itself; the parameters it needs
 * (algorithm, memory cost, time cost) come from the hash string, not from
 * this module, so a hash produced under different cost parameters still
 * verifies correctly.
 *
 * Never throws on a malformed or foreign-format hash — a corrupted row
 * should fail the login, not crash the request. `Bun.password.verify`
 * itself already returns `false` for a well-formed-but-wrong hash; the try
 * guards against a hash string it cannot parse at all (e.g. a bcrypt hash
 * from a different system, or an empty string).
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!plaintext || !hash) return false;
  try {
    return await Bun.password.verify(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Minimum length enforced at the RPC layer (T06) before a password is ever
 * hashed. Not a complexity rule — length is the dimension argon2id's cost
 * actually defends, and composition rules push users toward predictable
 * substitutions without meaningfully raising guess-resistance.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * A random temporary password for M13-T10's admin-driven reset — meant to
 * be read aloud or copy-pasted once, by an admin to a member with no
 * recovery email, so it favours being short enough to transcribe over
 * being memorable. 18 base64url characters from 12 bytes of CSPRNG output
 * comfortably clears `MIN_PASSWORD_LENGTH` with margin for the eventual
 * mandatory change. Like every other password, it is hashed before storage
 * and never logged; the RPC that mints it is the only place the plaintext
 * exists, and only in its response.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}
