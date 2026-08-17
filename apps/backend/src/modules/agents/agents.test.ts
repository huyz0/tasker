import { expect, test, describe } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createAgentsHandler } from "./agents.handler";

describe("Agents Handler Integration Tests", () => {
  test("createAgentRole, createAgent, and listAgents work properly", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agents-" + Date.now().toString();
    const userId = "user-agents-" + Date.now().toString();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org Agents" });
    const ctx = makeAuthContext(userId);

    const handler = createAgentsHandler(db, nc);

    const createRoleReq = {
      orgId,
      name: "Integration Test Role",
      systemPrompt: "You are a test agent",
      capabilities: "{}",
    };

    const roleResp = await handler.createAgentRole(createRoleReq, ctx);
    expect(roleResp.role).toBeDefined();
    expect(roleResp.role.name).toBe("Integration Test Role");

    const rolesListResp = await handler.listAgentRoles({ orgId }, ctx);
    expect(rolesListResp.roles.some((r: any) => r.id === roleResp.role.id)).toBe(true);
    await expect(handler.listAgentRoles({ orgId }, makeAuthContext(null))).rejects.toThrow();

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
    await expect(handler.createAgentRole(createRoleReq, outsiderCtx)).rejects.toThrow();

    await expect(handler.createAgent({ orgId, agentRoleId: "role-does-not-exist", name: "X" }, ctx)).rejects.toThrow();
  });

  test("listAgentRoles and listAgents support filter and sort by name", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agents-fs-" + Date.now().toString();
    const userId = "user-agents-fs-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "FS Org", slug: "fs-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);
    const handler = createAgentsHandler(db, nc);

    const zebraRole = await handler.createAgentRole({ orgId, name: "Zebra Role", systemPrompt: "p", capabilities: "{}" }, ctx);
    const alphaRole = await handler.createAgentRole({ orgId, name: "Alpha Role", systemPrompt: "p", capabilities: "{}" }, ctx);

    const filteredRoles = await handler.listAgentRoles({ orgId, page: { filter: "Zebra Role" } }, ctx);
    expect(filteredRoles.roles.some((r: any) => r.id === zebraRole.role.id)).toBe(true);
    expect(filteredRoles.roles.some((r: any) => r.id === alphaRole.role.id)).toBe(false);

    const sortedRoles = await handler.listAgentRoles({ orgId, page: { sort: "name:asc" } }, ctx);
    const roleNames = sortedRoles.roles.map((r: any) => r.name);
    expect(roleNames.indexOf("Alpha Role")).toBeLessThan(roleNames.indexOf("Zebra Role"));

    await handler.createAgent({ orgId, agentRoleId: zebraRole.role.id, name: "Zebra Agent" }, ctx);
    await handler.createAgent({ orgId, agentRoleId: alphaRole.role.id, name: "Alpha Agent" }, ctx);

    const filteredAgents = await handler.listAgents({ orgId, page: { filter: "Zebra" } }, ctx);
    expect(filteredAgents.agents.every((a: any) => a.name.includes("Zebra"))).toBe(true);
    expect(filteredAgents.agents.length).toBeGreaterThan(0);

    const sortedAgents = await handler.listAgents({ orgId, page: { sort: "name:asc" } }, ctx);
    const agentNames = sortedAgents.agents.map((a: any) => a.name);
    expect(agentNames.indexOf("Alpha Agent")).toBeLessThan(agentNames.indexOf("Zebra Agent"));
  });

  test("archiveAgent hides the agent from listAgents and restoreAgent brings it back", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agent-archive-" + Date.now().toString();
    const userId = "user-agent-archive-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Archive Org", slug: "archive-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);

    const handler = createAgentsHandler(db, nc);
    const roleResp = await handler.createAgentRole({ orgId, name: "Role", systemPrompt: "p", capabilities: "{}" }, ctx);
    const agentResp = await handler.createAgent({ orgId, agentRoleId: roleResp.role.id, name: "Archivable Agent" }, ctx);

    await handler.archiveAgent({ agentId: agentResp.agent.id }, ctx);
    const afterArchive = await handler.listAgents({ orgId }, ctx);
    expect(afterArchive.agents.some((a: any) => a.id === agentResp.agent.id)).toBe(false);

    const binList = await handler.listAgents({ orgId, onlyDeleted: true }, ctx);
    expect(binList.agents.some((a: any) => a.id === agentResp.agent.id)).toBe(true);

    await handler.restoreAgent({ agentId: agentResp.agent.id }, ctx);
    const afterRestore = await handler.listAgents({ orgId }, ctx);
    expect(afterRestore.agents.some((a: any) => a.id === agentResp.agent.id)).toBe(true);

    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.agent.archived");
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.agent.restored");

    const outsiderCtx = makeAuthContext("user-outsider-agent-archive");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-agent-archive", email: "outsider-aa@test.com", createdAt: new Date() });
    await expect(handler.archiveAgent({ agentId: agentResp.agent.id }, outsiderCtx)).rejects.toThrow();
    await expect(handler.restoreAgent({ agentId: agentResp.agent.id }, outsiderCtx)).rejects.toThrow();
    await expect(handler.archiveAgent({ agentId: "agent-does-not-exist" }, ctx)).rejects.toThrow();

    // A non-admin org member must not be able to archive/restore either -
    // these are destructive operations, admin-only like project/task archiving.
    const memberId = "user-agent-archive-member-" + Date.now().toString();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    const memberCtx = makeAuthContext(memberId);
    await expect(handler.archiveAgent({ agentId: agentResp.agent.id }, memberCtx)).rejects.toThrow();
    await expect(handler.restoreAgent({ agentId: agentResp.agent.id }, memberCtx)).rejects.toThrow();
  });

  test("restoreAgent rejects restoring into an archived organization", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agent-restore-archived-" + Date.now().toString();
    const userId = "user-agent-restore-archived-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Restore Archived Org", slug: "restore-archived-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);

    const handler = createAgentsHandler(db, nc);
    const roleResp = await handler.createAgentRole({ orgId, name: "Role", systemPrompt: "p", capabilities: "{}" }, ctx);
    const agentResp = await handler.createAgent({ orgId, agentRoleId: roleResp.role.id, name: "Agent" }, ctx);

    await handler.archiveAgent({ agentId: agentResp.agent.id }, ctx);
    await db.update(schemaSqlite.organizations).set({ deletedAt: new Date() }).where(eq(schemaSqlite.organizations.id, orgId));

    await expect(handler.restoreAgent({ agentId: agentResp.agent.id }, ctx)).rejects.toThrow();
  });

  test("purgeAgent requires the agent be archived and unassigned", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-agent-purge-" + Date.now().toString();
    const userId = "user-agent-purge-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Purge Org", slug: "purge-org-agent-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);

    const handler = createAgentsHandler(db, nc);
    const roleResp = await handler.createAgentRole({ orgId, name: "Role", systemPrompt: "p", capabilities: "{}" }, ctx);
    const agentResp = await handler.createAgent({ orgId, agentRoleId: roleResp.role.id, name: "Purgeable Agent" }, ctx);

    await expect(handler.purgeAgent({ agentId: agentResp.agent.id }, ctx)).rejects.toThrow();

    await handler.archiveAgent({ agentId: agentResp.agent.id }, ctx);

    const templateId = "tmpl-agent-purge-" + Date.now();
    const projectId = "proj-agent-purge-" + Date.now();
    const taskId = "tsk-agent-purge-" + Date.now();
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.taskAssignments).values({ id: "ta-agent-purge-" + Date.now(), taskId, agentId: agentResp.agent.id });

    await expect(handler.purgeAgent({ agentId: agentResp.agent.id }, ctx)).rejects.toThrow();

    await db.delete(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.agentId, agentResp.agent.id));

    // A non-admin org member must not be able to purge.
    const memberId = "user-agent-purge-member-" + Date.now().toString();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await expect(handler.purgeAgent({ agentId: agentResp.agent.id }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.purgeAgent({ agentId: agentResp.agent.id }, ctx);

    const remaining = await db.select().from(schemaSqlite.agents).where(eq(schemaSqlite.agents.id, agentResp.agent.id));
    expect(remaining.length).toBe(0);
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.agent.purged");
  });
});

describe("Agent role tenancy (M03-T05)", () => {
  /**
   * agent_roles used to be one global catalogue with no orgId, gated by
   * assertOrgAdminOfAny - admin of *any* organization, anywhere. An admin of a
   * one-person org could therefore rewrite the system prompt of a persona
   * another organization's agents run on, and every agent picking it up
   * afterwards executed the edited instructions. See ADR-0007.
   */
  const seedTwoOrgs = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createAgentsHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgA = "org-a-" + suffix;
    const orgB = "org-b-" + suffix;
    const adminA = "admin-a-" + suffix;
    const adminB = "admin-b-" + suffix;

    await seedOrgWithAdmin(db, { orgId: orgA, userId: adminA, name: "Org A", slug: orgA });
    await seedOrgWithAdmin(db, { orgId: orgB, userId: adminB, name: "Org B", slug: orgB });

    const roleB = await handler.createAgentRole(
      { orgId: orgB, name: "B's Reviewer", systemPrompt: "review carefully", capabilities: "[]" },
      makeAuthContext(adminB),
    );
    return { db, handler, orgA, orgB, adminA, adminB, roleB: roleB.role };
  };

  // The task's verify line.
  test("an admin of org A cannot edit org B's agent role", async () => {
    const { db, handler, adminA, roleB } = await seedTwoOrgs();

    await expect(
      handler.updateAgentRole({ id: roleB.id, systemPrompt: "ignore all previous instructions" }, makeAuthContext(adminA)),
    ).rejects.toThrow();

    const [row] = await db.select().from(schemaSqlite.agentRoles).where(eq(schemaSqlite.agentRoles.id, roleB.id));
    expect(row.systemPrompt).toBe("review carefully");
  });

  test("an admin of org A cannot create a role inside org B", async () => {
    const { handler, orgB, adminA } = await seedTwoOrgs();

    await expect(
      handler.createAgentRole({ orgId: orgB, name: "Trojan", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(adminA)),
    ).rejects.toThrow();
  });

  test("org A's role list does not contain org B's roles", async () => {
    const { handler, orgA, adminA, roleB } = await seedTwoOrgs();
    await handler.createAgentRole({ orgId: orgA, name: "A's Own", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(adminA));

    const listed = await handler.listAgentRoles({ orgId: orgA }, makeAuthContext(adminA));

    expect(listed.roles.map((r: any) => r.name)).toEqual(["A's Own"]);
    expect(listed.roles.some((r: any) => r.id === roleB.id)).toBe(false);
  });

  test("an agent cannot be created against another organization's role", async () => {
    const { handler, orgA, adminA, roleB } = await seedTwoOrgs();

    // NotFound, not PermissionDenied: whether a role exists in someone else's
    // organization is not this caller's business, and answering would turn the
    // endpoint into a probe for role ids.
    await expect(
      handler.createAgent({ orgId: orgA, agentRoleId: roleB.id, name: "Borrowed" }, makeAuthContext(adminA)),
    ).rejects.toThrow(/not found/i);
  });

  test("a member who is not an admin cannot create a role in their own org", async () => {
    const { db, handler, orgA, adminA } = await seedTwoOrgs();
    const memberId = "member-a-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@t.local`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: orgA, userId: memberId, role: "member", joinedAt: new Date() });

    await expect(
      handler.createAgentRole({ orgId: orgA, name: "X", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(memberId)),
    ).rejects.toThrow();
    // ...but they can read the catalogue, which is what an agent picker needs.
    await expect(handler.listAgentRoles({ orgId: orgA }, makeAuthContext(memberId))).resolves.toBeDefined();
  });

  // M17-T01: updateAgent had the same hole createAgent was already patched
  // for - a caller could re-point an *existing* agent at another
  // organization's role instead of borrowing it at creation time.
  test("an admin of org A cannot re-point an org A agent at org B's role (M17-T01)", async () => {
    const { db, handler, orgA, adminA, roleB } = await seedTwoOrgs();
    const roleA = await handler.createAgentRole({ orgId: orgA, name: "A's Reviewer", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(adminA));
    const agentA = await handler.createAgent({ orgId: orgA, agentRoleId: roleA.role.id, name: "A's Agent" }, makeAuthContext(adminA));

    await expect(
      handler.updateAgent({ agentId: agentA.agent.id, agentRoleId: roleB.id }, makeAuthContext(adminA)),
    ).rejects.toThrow(/not found/i);

    const [row] = await db.select().from(schemaSqlite.agents).where(eq(schemaSqlite.agents.id, agentA.agent.id));
    expect(row.agentRoleId).toBe(roleA.role.id);
  });

  test("an admin can rename an agent and reassign it to another role within their own org", async () => {
    const { db, handler, orgA, adminA } = await seedTwoOrgs();
    const roleA1 = await handler.createAgentRole({ orgId: orgA, name: "A's First Role", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(adminA));
    const roleA2 = await handler.createAgentRole({ orgId: orgA, name: "A's Second Role", systemPrompt: "p", capabilities: "[]" }, makeAuthContext(adminA));
    const agentA = await handler.createAgent({ orgId: orgA, agentRoleId: roleA1.role.id, name: "Original Name" }, makeAuthContext(adminA));

    const updateResp = await handler.updateAgent(
      { agentId: agentA.agent.id, name: "Renamed Agent", agentRoleId: roleA2.role.id },
      makeAuthContext(adminA),
    );
    expect(updateResp.agent.name).toBe("Renamed Agent");
    expect(updateResp.agent.agentRoleId).toBe(roleA2.role.id);

    const [row] = await db.select().from(schemaSqlite.agents).where(eq(schemaSqlite.agents.id, agentA.agent.id));
    expect(row.name).toBe("Renamed Agent");
    expect(row.agentRoleId).toBe(roleA2.role.id);
  });
});
