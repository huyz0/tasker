import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createAgentsHandler } from "./agents.handler";
import { hashToken, resolveAgentToken } from "../../lib/agentToken";
import { ConnectError, Code } from "@connectrpc/connect";

const DAY = 24 * 60 * 60 * 1000;

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, roleId = `role-${s}`, agentId = `agent-${s}`;
  const admin = `admin-${s}`, member = `member-${s}`, outsider = `out-${s}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: new Date() });
  for (const id of [admin, member, outsider]) {
    await db.insert(schema.users).values({ id, email: `${id}@t.test`, name: id, createdAt: new Date() });
  }
  await db.insert(schema.organizationMembers).values([
    { orgId, userId: admin, role: "admin", joinedAt: new Date() },
    { orgId, userId: member, role: "member", joinedAt: new Date() },
  ]);
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
  await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "Worker", createdAt: new Date() });
  return { orgId, agentId, admin, member, outsider };
}

const handlerFor = (db: any) => createAgentsHandler(db, null as any);

describe("createAgentToken", () => {
  test("returns the plaintext exactly once and stores only its hash", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin, orgId } = await seed(db);
    const handler = handlerFor(db);

    const res: any = await handler.createAgentToken(
      { agentId, name: "CI worker", scopes: ["tasks:read"] },
      makeAuthContext(admin),
    );

    expect(res.plaintext).toMatch(/^tskr_/);
    expect(res.token.tokenPrefix.length).toBeLessThan(res.plaintext.length);
    expect(res.token.orgId).toBe(orgId);
    expect(res.token.expired).toBe(false);

    const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.id, res.token.id));
    expect(rows[0].tokenHash).toBe(hashToken(res.plaintext));
    // The whole point: the secret is not recoverable from what was stored.
    expect(JSON.stringify(rows[0])).not.toContain(res.plaintext);
  });

  test("the token it returns actually authenticates", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const res: any = await handlerFor(db).createAgentToken(
      { agentId, name: "t", scopes: ["tasks:read", "tasks:write"] },
      makeAuthContext(admin),
    );
    const { principal } = await resolveAgentToken(db, res.plaintext);
    expect(principal).toEqual(expect.objectContaining({ kind: "agent", agentId, scopes: ["tasks:read", "tasks:write"] }));
  });

  test("defaults to 90 days and honours an explicit expiry", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const handler = handlerFor(db);

    const def: any = await handler.createAgentToken({ agentId, name: "d", scopes: ["tasks:read"] }, makeAuthContext(admin));
    const explicit: any = await handler.createAgentToken({ agentId, name: "e", scopes: ["tasks:read"], expiresInDays: 7 }, makeAuthContext(admin));

    const days = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / DAY);
    expect(days(def.token.expiresAt)).toBe(90);
    expect(days(explicit.token.expiresAt)).toBe(7);
  });

  test("refuses an expiry beyond the 365-day maximum, and a negative one", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const handler = handlerFor(db);
    for (const expiresInDays of [366, -1]) {
      await expect(handler.createAgentToken({ agentId, name: "x", scopes: ["tasks:read"], expiresInDays }, makeAuthContext(admin)))
        .rejects.toThrow();
    }
  });

  test("reads expiresInDays: 0 as unset, because proto3 cannot tell them apart", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    // A proto3 int32 has no field presence: a client that omits expiresInDays
    // sends 0. Rejecting 0 would reject every caller who did not set it, so it
    // has to mean "use the default" rather than "zero days".
    const res: any = await handlerFor(db).createAgentToken(
      { agentId, name: "z", scopes: ["tasks:read"], expiresInDays: 0 },
      makeAuthContext(admin),
    );
    expect(Math.round((new Date(res.token.expiresAt).getTime() - Date.now()) / DAY)).toBe(90);
  });

  test("refuses a scope outside the fixed vocabulary", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    // ADR-0008 closes the vocabulary. An unknown scope is far more likely to be
    // a typo that silently grants nothing than a deliberate extension - and a
    // token that appears to grant "task:read" but matches no check is worse
    // than one that was refused at creation.
    await expect(handlerFor(db).createAgentToken({ agentId, name: "x", scopes: ["task:read"] }, makeAuthContext(admin)))
      .rejects.toThrow(/scope/i);
  });

  test("refuses an empty scope list", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    await expect(handlerFor(db).createAgentToken({ agentId, name: "x", scopes: [] }, makeAuthContext(admin)))
      .rejects.toThrow(/scope/i);
  });

  test("is admin-only: a plain member cannot mint a credential", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, member } = await seed(db);
    try {
      await handlerFor(db).createAgentToken({ agentId, name: "x", scopes: ["tasks:read"] }, makeAuthContext(member));
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  test("an admin of another organization cannot mint against this agent", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    await expect(handlerFor(db).createAgentToken({ agentId: a.agentId, name: "x", scopes: ["tasks:read"] }, makeAuthContext(b.admin)))
      .rejects.toThrow(ConnectError);
  });

  test("refuses an unknown agent with NotFound", async () => {
    const { db } = await setupIntegrationTest();
    const { admin } = await seed(db);
    try {
      await handlerFor(db).createAgentToken({ agentId: "nope", name: "x", scopes: ["tasks:read"] }, makeAuthContext(admin));
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.NotFound);
    }
  });
});

describe("listAgentTokens", () => {
  test("never returns the plaintext or the hash", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const handler = handlerFor(db);
    const created: any = await handler.createAgentToken({ agentId, name: "CI", scopes: ["tasks:read"] }, makeAuthContext(admin));

    const list: any = await handler.listAgentTokens({ agentId }, makeAuthContext(admin));

    expect(list.tokens).toHaveLength(1);
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain(created.plaintext);
    expect(serialized).not.toContain(hashToken(created.plaintext));
    expect(list.tokens[0].tokenPrefix).toBe(created.token.tokenPrefix);
  });

  test("marks an expired token expired, computed on the server", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin, orgId } = await seed(db);
    await db.insert(schema.apiTokens).values({
      id: "tok-old", orgId, agentId, name: "old", tokenPrefix: "tskr_old", tokenHash: "h-old",
      scopes: JSON.stringify(["tasks:read"]), createdBy: admin, createdAt: new Date(),
      expiresAt: new Date(Date.now() - DAY),
    });

    const list: any = await handlerFor(db).listAgentTokens({ agentId }, makeAuthContext(admin));
    expect(list.tokens[0].expired).toBe(true);
  });

  test("still lists a revoked token, because it is history not absence", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const handler = handlerFor(db);
    const created: any = await handler.createAgentToken({ agentId, name: "x", scopes: ["tasks:read"] }, makeAuthContext(admin));
    await handler.revokeAgentToken({ tokenId: created.token.id }, makeAuthContext(admin));

    const list: any = await handler.listAgentTokens({ agentId }, makeAuthContext(admin));
    expect(list.tokens).toHaveLength(1);
    expect(list.tokens[0].revokedAt).toBeTruthy();
  });

  test("is admin-only", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, member } = await seed(db);
    await expect(handlerFor(db).listAgentTokens({ agentId }, makeAuthContext(member))).rejects.toThrow(ConnectError);
  });
});

describe("revokeAgentToken", () => {
  test("stops the token on the next call and leaves others working", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin } = await seed(db);
    const handler = handlerFor(db);
    const first: any = await handler.createAgentToken({ agentId, name: "a", scopes: ["tasks:read"] }, makeAuthContext(admin));
    const second: any = await handler.createAgentToken({ agentId, name: "b", scopes: ["tasks:read"] }, makeAuthContext(admin));

    await handler.revokeAgentToken({ tokenId: first.token.id }, makeAuthContext(admin));

    expect((await resolveAgentToken(db, first.plaintext)).principal).toBeNull();
    expect((await resolveAgentToken(db, second.plaintext)).principal).not.toBeNull();
  });

  test("scopes from the token's own row, not from a caller-supplied org", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    const handler = handlerFor(db);
    const token: any = await handler.createAgentToken({ agentId: a.agentId, name: "a", scopes: ["tasks:read"] }, makeAuthContext(a.admin));

    // An admin elsewhere must not be able to revoke this one by naming its id.
    await expect(handler.revokeAgentToken({ tokenId: token.token.id }, makeAuthContext(b.admin)))
      .rejects.toThrow(ConnectError);
    expect((await resolveAgentToken(db, token.plaintext)).principal).not.toBeNull();
  });

  test("revoking an unknown token is NotFound", async () => {
    const { db } = await setupIntegrationTest();
    const { admin } = await seed(db);
    try {
      await handlerFor(db).revokeAgentToken({ tokenId: "nope" }, makeAuthContext(admin));
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.NotFound);
    }
  });

  test("is admin-only", async () => {
    const { db } = await setupIntegrationTest();
    const { agentId, admin, member } = await seed(db);
    const handler = handlerFor(db);
    const token: any = await handler.createAgentToken({ agentId, name: "a", scopes: ["tasks:read"] }, makeAuthContext(admin));
    await expect(handler.revokeAgentToken({ tokenId: token.token.id }, makeAuthContext(member))).rejects.toThrow(ConnectError);
  });
});
