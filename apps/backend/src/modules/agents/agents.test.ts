import { expect, test, describe } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createAgentsHandler } from "./agents.handler";

describe("Agents Handler Integration Tests", () => {
  test("createAgentRole, createAgent, and listAgents work properly", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agents-" + Date.now().toString();
    const userId = "user-agents-" + Date.now().toString();
    try {
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org Agents",
          slug: "test-org-agents-" + Date.now().toString(),
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
        await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    } catch {}
    const ctx = makeAuthContext(userId);

    const handler = createAgentsHandler(db, nc);

    const createRoleReq = {
      name: "Integration Test Role",
      systemPrompt: "You are a test agent",
      capabilities: "{}",
    };

    const roleResp = await handler.createAgentRole(createRoleReq, ctx);
    expect(roleResp.role).toBeDefined();
    expect(roleResp.role.name).toBe("Integration Test Role");

    const createAgentReq = {
      orgId: orgId,
      agentRoleId: roleResp.role.id,
      name: "Test Agent Instance",
    };

    const agentResp = await handler.createAgent(createAgentReq, ctx);
    expect(agentResp.agent).toBeDefined();
    expect(agentResp.agent.name).toBe("Test Agent Instance");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.agent.created");

    const listResp = await handler.listAgents({ orgId }, ctx);
    expect(listResp.agents.some((a: any) => a.name === "Test Agent Instance")).toBe(true);

    const outsiderCtx = makeAuthContext("user-outsider-agents");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-agents", email: "outsider-a@test.com", createdAt: new Date() });
    await expect(handler.listAgents({ orgId }, outsiderCtx)).rejects.toThrow();
    await expect(handler.createAgent({ orgId, agentRoleId: roleResp.role.id, name: "X" }, outsiderCtx)).rejects.toThrow();
    await expect(handler.createAgentRole(createRoleReq, makeAuthContext(null))).rejects.toThrow();
  });
});
