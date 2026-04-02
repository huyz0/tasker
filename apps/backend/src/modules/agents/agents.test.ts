import { expect, test, describe } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createAgentsHandler } from "./agents.handler";

describe("Agents Handler Integration Tests", () => {
  test("createAgentRole and createAgent work properly", async () => {
    const { db, nc } = await setupIntegrationTest();
    
    // Pre-requisite: Setup organization
    const orgId = "org-agents-" + Date.now().toString();
    try {
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org Agents",
          slug: "test-org-agents-" + Date.now().toString(),
          createdAt: new Date(),
        });
    } catch {}

    const handler = createAgentsHandler(db, nc);

    // Test createAgentRole
    const createRoleReq = {
      name: "Integration Test Role",
      systemPrompt: "You are a test agent",
      capabilities: "{}",
    };

    const roleResp = await handler.createAgentRole(createRoleReq);
    expect(roleResp.role).toBeDefined();
    expect(roleResp.role.name).toBe("Integration Test Role");

    // Test createAgent
    const createAgentReq = {
      orgId: orgId,
      agentRoleId: roleResp.role.id,
      name: "Test Agent Instance",
    };

    const agentResp = await handler.createAgent(createAgentReq);
    expect(agentResp.agent).toBeDefined();
    expect(agentResp.agent.name).toBe("Test Agent Instance");

    // Verify NATS
    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.agent.created");
  });
});
