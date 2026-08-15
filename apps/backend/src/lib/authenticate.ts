import { parseBearerToken, resolveSessionPayload, type Principal } from '../modules/auth/session';
import { isSessionRevoked } from './sessionRevocation';
import { isAgentToken, resolveAgentToken, touchLastUsed } from './agentToken';

/**
 * Turns a request's credentials into a Principal, or null.
 *
 * This lives here rather than inline in the interceptor because index.ts is
 * excluded from coverage and cannot be exercised by the suite — the decision
 * about who a caller *is* is the last thing that should be untestable.
 *
 * An agent token and a human bearer token arrive in the same Authorization
 * header, told apart by the `tskr_` prefix (ADR-0008). Trying the session
 * verifier on an agent token and the token lookup on a session token would
 * work, but it would mean a database query on every malformed header and would
 * make the failure modes of the two paths indistinguishable in a log.
 */
export async function resolvePrincipal(
  db: any,
  headers: { cookie: string | null; authorization: string | null },
): Promise<Principal | null> {
  const bearer = parseBearerToken(headers.authorization);

  if (isAgentToken(bearer)) {
    const { principal, tokenId, rejection } = await resolveAgentToken(db, bearer!);
    // Only a token that actually authenticated gets its usage recorded. Stamping
    // lastUsedAt on a rejected token would make a revoked credential look live
    // in the list view, which is the one place an operator looks to confirm the
    // revocation worked.
    if (principal && tokenId && !rejection) touchLastUsed(db, tokenId);
    return principal;
  }

  const payload = resolveSessionPayload(headers);
  if (!payload) return null;
  // A revoked session's token still verifies — signature and expiry are
  // unaffected by revocation — so this check is what makes logout take effect.
  if (await isSessionRevoked(db, payload.jti)) return null;
  return { kind: 'user', userId: payload.userId };
}
