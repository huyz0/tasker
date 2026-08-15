import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import * as schemaMysql from '../db/schema.mysql';
import * as schemaSqlite from '../db/schema.sqlite';
import type { Principal } from '../modules/auth/session';

/**
 * Agent credentials (ADR-0008): an opaque 256-bit random secret behind a fixed
 * prefix, stored only as a SHA-256 hash.
 *
 * The prefix is not decoration. It is what lets the interceptor tell an agent
 * token from a human session bearer token without trying to parse both, and it
 * is what a secret scanner or a log grep matches on.
 */
export const TOKEN_PREFIX = 'tskr_';

/** Characters of the plaintext kept for display, including the prefix. */
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;

export const isAgentToken = (token: string | null): boolean => !!token?.startsWith(TOKEN_PREFIX);

/**
 * SHA-256, hex. Not bcrypt: this input is 256 bits of CSPRNG output, where a
 * slow hash defends against nothing and makes the token unlookupable — see
 * ADR-0008 for the full argument.
 */
export const hashToken = (plaintext: string): string =>
  createHash('sha256').update(plaintext).digest('hex');

export interface MintedToken {
  plaintext: string;
  tokenPrefix: string;
  tokenHash: string;
}

/** Mints a new token. The plaintext is returned once and never stored. */
export function mintToken(): MintedToken {
  const plaintext = TOKEN_PREFIX + randomBytes(32).toString('base64url');
  return {
    plaintext,
    tokenPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
    tokenHash: hashToken(plaintext),
  };
}

function tables() {
  const standalone = process.env.STANDALONE === 'true';
  return standalone
    ? { apiTokens: schemaSqlite.apiTokens, agents: schemaSqlite.agents }
    : { apiTokens: schemaMysql.apiTokens, agents: schemaMysql.agents };
}

// Not exported: the union is reachable through TokenResolution, and knip fails
// the build on an export nothing imports. Export it when a caller needs to name it.
type TokenRejection = 'unknown' | 'revoked' | 'expired' | 'agent-deleted';

export interface TokenResolution {
  principal: Principal | null;
  tokenId: string | null;
  rejection: TokenRejection | null;
}

/**
 * Resolves a presented token to an agent principal, or explains why not.
 *
 * The reason is returned rather than logged here because the caller decides
 * what a rejected token means — the interceptor treats every rejection the same
 * way on the wire (no principal), while tests and diagnostics need to tell
 * "revoked" from "never existed".
 *
 * One indexed lookup on the unique token_hash. The agent join is part of the
 * same query rather than a second round trip: a deleted agent's token must stop
 * working, and doing that in two steps would mean paying twice on every single
 * agent request.
 */
export async function resolveAgentToken(db: any, plaintext: string, now: Date = new Date()): Promise<TokenResolution> {
  const { apiTokens, agents } = tables();
  const rows = await db
    .select({
      id: (apiTokens as any).id,
      agentId: (apiTokens as any).agentId,
      orgId: (apiTokens as any).orgId,
      scopes: (apiTokens as any).scopes,
      expiresAt: (apiTokens as any).expiresAt,
      revokedAt: (apiTokens as any).revokedAt,
      agentDeletedAt: (agents as any).deletedAt,
    })
    .from(apiTokens)
    .leftJoin(agents, eq((apiTokens as any).agentId, (agents as any).id))
    .where(eq((apiTokens as any).tokenHash, hashToken(plaintext)))
    .limit(1);

  const row = rows?.[0];
  if (!row) return { principal: null, tokenId: null, rejection: 'unknown' };

  // Order matters only for the diagnostic: a revoked *and* expired token is
  // reported as revoked, because that is the deliberate act.
  if (row.revokedAt) return { principal: null, tokenId: row.id, rejection: 'revoked' };
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    return { principal: null, tokenId: row.id, rejection: 'expired' };
  }
  if (row.agentDeletedAt) return { principal: null, tokenId: row.id, rejection: 'agent-deleted' };

  return {
    principal: {
      kind: 'agent',
      agentId: row.agentId,
      orgId: row.orgId,
      tokenId: row.id,
      scopes: parseScopes(row.scopes),
    },
    tokenId: row.id,
    rejection: null,
  };
}

/**
 * Scopes are stored as a JSON array. A row whose scopes do not parse grants
 * nothing rather than throwing: a malformed row should not take the process
 * down, and an empty scope set is already refused by every scope check.
 */
export function parseScopes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Records that a token was used, without making the request wait for it.
 *
 * Deliberately not awaited by the caller: this is bookkeeping for the token
 * list view, and a write that fails or runs slow must not turn a working
 * request into a failed one. Errors are swallowed for the same reason — there
 * is nothing the request can do about them, and an unhandled rejection here
 * would take down the process.
 */
export function touchLastUsed(db: any, tokenId: string, now: Date = new Date()): void {
  const { apiTokens } = tables();
  Promise.resolve()
    .then(() => db.update(apiTokens).set({ lastUsedAt: now }).where(eq((apiTokens as any).id, tokenId)))
    .catch(() => {});
}

/** Marks a token revoked. Idempotent: revoking twice is not an error. */
export async function revokeToken(db: any, tokenId: string, now: Date = new Date()): Promise<void> {
  const { apiTokens } = tables();
  await db
    .update(apiTokens)
    .set({ revokedAt: now })
    .where(and(eq((apiTokens as any).id, tokenId), isNull((apiTokens as any).revokedAt)));
}
