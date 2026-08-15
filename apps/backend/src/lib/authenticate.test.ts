import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import { createSessionToken, resolveSessionPayload } from "../modules/auth/session";
import { revokeSession } from "./sessionRevocation";
import { mintToken, revokeToken } from "./agentToken";
import { resolvePrincipal } from "./authenticate";

const HOUR = 60 * 60 * 1000;
const headers = (over: Partial<{ cookie: string; authorization: string }> = {}) => ({
  cookie: over.cookie ?? null,
  authorization: over.authorization ?? null,
});

async function seedTokenFor(db: any, over: Record<string, any> = {}) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, userId = `user-${s}`, roleId = `role-${s}`, agentId = `agent-${s}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@t.test`, createdAt: new Date() });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "A", createdAt: new Date() });
  const minted = mintToken();
  const id = `tok-${s}`;
  await db.insert(schema.apiTokens).values({
    id, orgId, agentId, name: "worker",
    tokenPrefix: minted.tokenPrefix, tokenHash: minted.tokenHash,
    scopes: JSON.stringify(["tasks:read"]), createdBy: userId, createdAt: new Date(),
    expiresAt: over.expiresAt ?? new Date(Date.now() + 30 * 24 * HOUR),
  });
  return { id, plaintext: minted.plaintext, orgId, agentId, userId };
}

describe("resolvePrincipal — agent tokens", () => {
  it("authenticates an agent from the Authorization header with no session anywhere", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, agentId, orgId, id } = await seedTokenFor(db);

    const principal = await resolvePrincipal(db, headers({ authorization: `Bearer ${plaintext}` }));

    expect(principal).toEqual({ kind: "agent", agentId, orgId, tokenId: id, scopes: ["tasks:read"] });
  });

  it("rejects a revoked token on the very next call", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await seedTokenFor(db);
    const auth = `Bearer ${plaintext}`;

    expect(await resolvePrincipal(db, headers({ authorization: auth }))).not.toBeNull();
    await revokeToken(db, id);
    expect(await resolvePrincipal(db, headers({ authorization: auth }))).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext } = await seedTokenFor(db, { expiresAt: new Date(Date.now() - HOUR) });
    expect(await resolvePrincipal(db, headers({ authorization: `Bearer ${plaintext}` }))).toBeNull();
  });

  it("rejects a token-shaped string that was never issued", async () => {
    const { db } = await setupIntegrationTest();
    expect(await resolvePrincipal(db, headers({ authorization: `Bearer ${mintToken().plaintext}` }))).toBeNull();
  });

  it("records lastUsedAt for a token that authenticated", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await seedTokenFor(db);

    await resolvePrincipal(db, headers({ authorization: `Bearer ${plaintext}` }));
    await new Promise((r) => setTimeout(r, 50));

    const row = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).limit(1);
    expect(row[0].lastUsedAt).not.toBeNull();
  });

  it("does NOT record lastUsedAt for a rejected token", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, id } = await seedTokenFor(db);
    await revokeToken(db, id);

    await resolvePrincipal(db, headers({ authorization: `Bearer ${plaintext}` }));
    await new Promise((r) => setTimeout(r, 50));

    // The token list is where an operator confirms a revocation took effect.
    // Stamping "last used: just now" on a dead credential makes it read as live.
    const row = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, id)).limit(1);
    expect(row[0].lastUsedAt).toBeNull();
  });

  it("ignores a cookie when an agent token is presented — a token does not borrow a session", async () => {
    const { db } = await setupIntegrationTest();
    const { plaintext, agentId } = await seedTokenFor(db);
    await db.insert(schema.users).values({ id: "human-1", email: "h@t.test", createdAt: new Date() });

    const principal = await resolvePrincipal(db, {
      cookie: `session=${createSessionToken("human-1")}`,
      authorization: `Bearer ${plaintext}`,
    });

    expect(principal).toEqual(expect.objectContaining({ kind: "agent", agentId }));
  });

  it("does not fall back to the session when the agent token is bad", async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.users).values({ id: "human-2", email: "h2@t.test", createdAt: new Date() });

    // A forged or revoked token presented alongside a valid cookie must not
    // silently downgrade to the human - that would let a caller keep acting as
    // somebody else after their agent credential died.
    const principal = await resolvePrincipal(db, {
      cookie: `session=${createSessionToken("human-2")}`,
      authorization: `Bearer ${mintToken().plaintext}`,
    });

    expect(principal).toBeNull();
  });

  it("keeps that guarantee even if resolvePrincipal stops enforcing it", () => {
    // The test above passes for two independent reasons, and on its own it
    // cannot tell them apart: removing resolvePrincipal's early return leaves
    // it green, because resolveSessionPayload prefers the Authorization header
    // and so never reaches the cookie. Discovered by injection - the outcome
    // assertion alone was proving nothing about the code it appeared to guard.
    //
    // This pins the second layer explicitly. If someone makes session
    // resolution fall back to the cookie when a bearer is present, that is the
    // moment a dead agent token starts borrowing a human session, and this
    // fails rather than the change looking harmless.
    const payload = resolveSessionPayload({
      cookie: `session=${createSessionToken("human-3")}`,
      authorization: `Bearer ${mintToken().plaintext}`,
    });
    expect(payload).toBeNull();
  });
});

describe("resolvePrincipal — human sessions", () => {
  it("authenticates from a cookie", async () => {
    const { db } = await setupIntegrationTest();
    const principal = await resolvePrincipal(db, { cookie: `session=${createSessionToken("user-1")}`, authorization: null });
    expect(principal).toEqual({ kind: "user", userId: "user-1" });
  });

  it("authenticates from a bearer session token, which is how the CLI logs in", async () => {
    const { db } = await setupIntegrationTest();
    const principal = await resolvePrincipal(db, headers({ authorization: `Bearer ${createSessionToken("user-1")}` }));
    expect(principal).toEqual({ kind: "user", userId: "user-1" });
  });

  it("rejects a revoked session", async () => {
    const { db } = await setupIntegrationTest();
    await db.insert(schema.users).values({ id: "user-r", email: "r@t.test", createdAt: new Date() });
    const token = createSessionToken("user-r");
    const jti = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString()).jti;

    expect(await resolvePrincipal(db, headers({ authorization: `Bearer ${token}` }))).not.toBeNull();
    await revokeSession(db, jti, "user-r");
    expect(await resolvePrincipal(db, headers({ authorization: `Bearer ${token}` }))).toBeNull();
  });

  it("returns null with no credentials at all", async () => {
    const { db } = await setupIntegrationTest();
    expect(await resolvePrincipal(db, headers())).toBeNull();
  });

  it("returns null for a garbage Authorization header", async () => {
    const { db } = await setupIntegrationTest();
    expect(await resolvePrincipal(db, headers({ authorization: "Bearer not-a-real-token" }))).toBeNull();
    expect(await resolvePrincipal(db, headers({ authorization: "Basic abc" }))).toBeNull();
  });
});
