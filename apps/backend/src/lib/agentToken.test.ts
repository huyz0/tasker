import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import {
  TOKEN_PREFIX,
  hashToken,
  isAgentToken,
  mintToken,
  parseScopes,
  resolveAgentToken,
  revokeToken,
  touchLastUsed,
} from "./agentToken";

const HOUR = 60 * 60 * 1000;

async function seedAgent(db: any, suffix = String(Math.random()).slice(2)) {
  const orgId = `org-${suffix}`;
  const userId = `user-${suffix}`;
  const roleId = `role-${suffix}`;
  const agentId = `agent-${suffix}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t.test`, createdAt: new Date() });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "Agent", createdAt: new Date() });
  return { orgId, userId, agentId };
}

async function issueToken(db: any, over: Record<string, any> = {}) {
  const { orgId, userId, agentId } = over.seeded ?? (await seedAgent(db));
  const minted = mintToken();
  const id = over.id ?? `tok-${String(Math.random()).slice(2)}`;
  await db.insert(schema.apiTokens).values({
    id,
    orgId,
    agentId,
    name: "CI worker",
    tokenPrefix: minted.tokenPrefix,
    tokenHash: minted.tokenHash,
    scopes: JSON.stringify(over.scopes ?? ["tasks:read"]),
    createdBy: userId,
    createdAt: new Date(),
    expiresAt: over.expiresAt ?? new Date(Date.now() + 90 * 24 * HOUR),
    revokedAt: over.revokedAt ?? null,
  });
  return { id, plaintext: minted.plaintext, orgId, agentId, userId };
}

describe("minting", () => {
  it("produces a prefixed, high-entropy plaintext that is never equal to its hash", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a.plaintext.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.tokenHash).not.toBe(a.plaintext);
    expect(a.tokenHash).toHaveLength(64);
    // 32 bytes base64url is 43 chars; anything shorter means the entropy
    // argument in ADR-0008 (which is why a fast hash is safe here) has quietly
    // stopped being true.
    expect(a.plaintext.length - TOKEN_PREFIX.length).toBeGreaterThanOrEqual(43);
  });

  it("stores a display prefix that identifies without revealing", () => {
    const { plaintext, tokenPrefix } = mintToken();
    expect(plaintext.startsWith(tokenPrefix)).toBe(true);
    expect(tokenPrefix.length).toBeLessThan(plaintext.length / 2);
  });

  it("hashes deterministically, so a presented token can be looked up", () => {
    expect(hashToken("tskr_abc")).toBe(hashToken("tskr_abc"));
    expect(hashToken("tskr_abc")).not.toBe(hashToken("tskr_abd"));
  });

  it("recognises its own tokens and nothing else", () => {
    expect(isAgentToken(mintToken().plaintext)).toBe(true);
    expect(isAgentToken("eyJ1c2VySWQiOiJ1LTEifQ.sig")).toBe(false);
    expect(isAgentToken(null)).toBe(false);
  });
});

describe("resolving a presented token", () => {
  it("returns an agent principal carrying org and scopes from the row", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, orgId, agentId, id } = await issueToken(db, { scopes: ["tasks:read", "tasks:write"] });

    const { principal, rejection } = await resolveAgentToken(db, plaintext);

    expect(rejection).toBeNull();
    expect(principal).toEqual({ kind: "agent", agentId, orgId, tokenId: id, scopes: ["tasks:read", "tasks:write"] });
  });

  it("rejects a token that was never issued", async () => {
    const { db } = await setupIntegrationTest();
    await issueToken(db);
    const { principal, rejection } = await resolveAgentToken(db, mintToken().plaintext);
    expect(principal).toBeNull();
    expect(rejection).toBe("unknown");
  });

  it("rejects a revoked token on the next call", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await issueToken(db);

    expect((await resolveAgentToken(db, plaintext)).principal).not.toBeNull();
    await revokeToken(db, id);
    const after = await resolveAgentToken(db, plaintext);

    expect(after.principal).toBeNull();
    expect(after.rejection).toBe("revoked");
  });

  it("does not affect any other token when one is revoked", async () => {
    const { db } = await setupIntegrationTest();
    const seeded = await seedAgent(db);
    const first = await issueToken(db, { seeded });
    const second = await issueToken(db, { seeded });

    await revokeToken(db, first.id);

    expect((await resolveAgentToken(db, first.plaintext)).rejection).toBe("revoked");
    expect((await resolveAgentToken(db, second.plaintext)).principal).not.toBeNull();
  });

  it("rejects an expired token", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext } = await issueToken(db, { expiresAt: new Date(Date.now() - HOUR) });
    const { principal, rejection } = await resolveAgentToken(db, plaintext);
    expect(principal).toBeNull();
    expect(rejection).toBe("expired");
  });

  it("treats expiry as an instant, not a day — a token one second past its expiry is dead", async () => {
    const { db } = await setupIntegrationTest();
    const expiresAt = new Date(Date.now() + HOUR);
    const { plaintext } = await issueToken(db, { expiresAt });
    expect((await resolveAgentToken(db, plaintext, new Date(expiresAt.getTime() - 1000))).principal).not.toBeNull();
    expect((await resolveAgentToken(db, plaintext, new Date(expiresAt.getTime() + 1000))).rejection).toBe("expired");
  });

  it("reports a revoked and expired token as revoked, because that was the deliberate act", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await issueToken(db, { expiresAt: new Date(Date.now() - HOUR) });
    await db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(eq(schema.apiTokens.id, id));
    expect((await resolveAgentToken(db, plaintext)).rejection).toBe("revoked");
  });

  it("rejects a live token whose agent has been deleted", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, agentId } = await issueToken(db);
    await db.update(schema.agents).set({ deletedAt: new Date() }).where(eq(schema.agents.id, agentId));
    const { principal, rejection } = await resolveAgentToken(db, plaintext);
    expect(principal).toBeNull();
    expect(rejection).toBe("agent-deleted");
  });

  it("grants nothing when the stored scopes are malformed rather than throwing", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await issueToken(db);
    await db.update(schema.apiTokens).set({ scopes: "not json" }).where(eq(schema.apiTokens.id, id));
    const { principal } = await resolveAgentToken(db, plaintext);
    expect(principal).not.toBeNull();
    expect(principal && principal.kind === "agent" && principal.scopes).toEqual([]);
  });
});

describe("parseScopes", () => {
  it("reads a JSON array and rejects everything else", () => {
    expect(parseScopes('["tasks:read"]')).toEqual(["tasks:read"]);
    expect(parseScopes('["tasks:read", 7, null]')).toEqual(["tasks:read"]);
    expect(parseScopes("not json")).toEqual([]);
    expect(parseScopes('{"tasks":"read"}')).toEqual([]);
    expect(parseScopes(null)).toEqual([]);
    expect(parseScopes(["tasks:write"])).toEqual(["tasks:write"]);
  });
});

describe("revocation", () => {
  it("is idempotent and keeps the first revocation time", async () => {
    const { db } = await setupIntegrationTest();
    const { id } = await issueToken(db);
    const first = new Date(Date.now() - HOUR);
    await revokeToken(db, id, first);
    await revokeToken(db, id, new Date());
    const row = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).limit(1);
    // Overwriting would rewrite history: the audit answer to "when did this
    // stop working" is the first revocation, not the last person to click it.
    // Compared to the second because drizzle's integer timestamp mode stores
    // seconds - asserting milliseconds tests the storage precision, not the
    // behaviour.
    expect(Math.floor(new Date(row[0].revokedAt).getTime() / 1000)).toBe(Math.floor(first.getTime() / 1000));
  });
});

describe("lastUsedAt", () => {
  it("is recorded, but not on the request's critical path", async () => {
    const { db } = await setupIntegrationTest();
    const { id } = await issueToken(db);
    const when = new Date(Date.now() - HOUR);

    // Returns void, synchronously - nothing for a caller to await.
    expect(touchLastUsed(db, id, when)).toBeUndefined();

    await new Promise((r) => setTimeout(r, 50));
    const row = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).limit(1);
    expect(Math.floor(new Date(row[0].lastUsedAt).getTime() / 1000)).toBe(Math.floor(when.getTime() / 1000));
  });

  it("swallows a write failure instead of failing the request or the process", async () => {
    const brokenDb = { update: () => { throw new Error("db down"); } };
    expect(() => touchLastUsed(brokenDb as any, "tok-1")).not.toThrow();
    // An unhandled rejection here would take the process down on a bookkeeping
    // write that nothing is waiting for.
    await new Promise((r) => setTimeout(r, 20));
  });
});
