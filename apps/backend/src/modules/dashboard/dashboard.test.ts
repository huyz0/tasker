import { describe, it, expect, beforeEach } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import createDashboardHandler from "./dashboard.handler";

function captureServiceImpl(db: any) {
  let impl: any;
  const fakeRouter = { service: (_d: any, i: any) => { impl = i; return fakeRouter; } };
  createDashboardHandler(fakeRouter as any, db);
  return impl;
}

/**
 * The dashboard is entirely joins over data other features write, so what these
 * tests pin is the *questions* — not the shape of the response.
 *
 * Each panel replaced a count card that answered nothing, so the thing worth
 * asserting is that each one narrows to something a supervisor would act on:
 * only my reviews, only tasks whose status is contradicted, only agents in this
 * organization, only recent work.
 */
describe("Dashboard Handler", () => {
  let db: any, impl: any, ctx: any;
  let orgId: string, projectId: string, userId: string, agentId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    impl = captureServiceImpl(db);

    const stamp = crypto.randomUUID();
    orgId = `org-${stamp}`;
    projectId = `proj-${stamp}`;
    userId = `user-${stamp}`;
    agentId = `agt-${stamp}`;
    const templateId = `tmpl-${stamp}`;
    const roleId = `role-${stamp}`;
    const now = new Date();

    await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: `org-${stamp}`, createdAt: now });
    await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: now });
    await db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: now });
    await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
    await db.insert(schema.projects).values({ id: projectId, orgId, templateId, name: "P", key: "P", ownerId: userId, createdAt: now });
    await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "R", systemPrompt: "s", capabilities: "[]", createdAt: now });
    await db.insert(schema.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "Scout", createdAt: now });

    ctx = makeAuthContext(userId);
  });

  const task = async (id: string, status: string, title = "T") => {
    await db.insert(schema.tasks).values({
      id, projectId, displayId: id.toUpperCase(), title, status, createdAt: new Date(),
    });
    return id;
  };

  it("lists only tasks the caller reviews, and only while they are unfinished", async () => {
    await task("t-open", "in-progress");
    await task("t-done", "done");
    await task("t-other", "todo");
    await db.insert(schema.taskReviewers).values([
      { id: "rv-1", taskId: "t-open", userId },
      { id: "rv-2", taskId: "t-done", userId },
      // Somebody else's review is not the caller's queue.
      { id: "rv-3", taskId: "t-other", userId: "someone-else" },
    ]);

    const res = await impl.getDashboard({ orgId }, ctx);

    expect(res.awaitingReview.map((t: any) => t.id)).toEqual(["t-open"]);
    expect(Number(res.awaitingReviewCount)).toBe(1);
  });

  it("reports a task marked done whose pull request is still open", async () => {
    await task("t-claimed", "done", "Claimed finished");
    await task("t-honest", "done", "Actually finished");
    const linkId = `lnk-${crypto.randomUUID()}`;
    await db.insert(schema.repositoryLinks).values({
      id: linkId, projectId, provider: "github", remoteName: "o/r", accessTokenEncrypted: "enc", createdAt: new Date(),
    });
    await db.insert(schema.remotePullRequests).values([
      { id: "pr-1", repositoryLinkId: linkId, taskId: "t-claimed", remotePrId: "42", title: "wip", status: "open", url: "http://x/42", updatedAt: new Date() },
      { id: "pr-2", repositoryLinkId: linkId, taskId: "t-honest", remotePrId: "43", title: "shipped", status: "merged", url: "http://x/43", updatedAt: new Date() },
    ]);

    const res = await impl.getDashboard({ orgId }, ctx);

    // A merged PR on a done task is agreement, and must not be reported.
    expect(res.disagreements).toHaveLength(1);
    expect(res.disagreements[0].task.id).toBe("t-claimed");
    expect(res.disagreements[0].pullRequestUrl).toBe("http://x/42");
    expect(Number(res.disagreementCount)).toBe(1);
  });

  it("reports when an agent was last heard from, and how much it is holding", async () => {
    const lastUsed = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    await db.insert(schema.apiTokens).values({
      id: `tok-${crypto.randomUUID()}`, orgId, agentId, name: "t", tokenPrefix: "tk_a",
      tokenHash: "h", scopes: "tasks:read", createdBy: userId, createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000), lastUsedAt: lastUsed,
    });
    await task("t-held", "in-progress");
    await task("t-shipped", "done");
    await db.insert(schema.taskAssignments).values([
      { id: "as-1", taskId: "t-held", agentId },
      // Finished work is not work the agent is holding.
      { id: "as-2", taskId: "t-shipped", agentId },
    ]);

    const res = await impl.getDashboard({ orgId }, ctx);
    const scout = res.agents.find((a: any) => a.id === agentId);

    expect(scout.name).toBe("Scout");
    // Compared at second resolution: `last_used_at` is a seconds column, so the
    // round trip legitimately drops the milliseconds it was given.
    expect(Math.floor(new Date(scout.lastUsedAt).getTime() / 1000)).toBe(Math.floor(lastUsed.getTime() / 1000));
    expect(Number(scout.openTaskCount)).toBe(1);
  });

  it("surfaces an agent that has never called at all", async () => {
    // A deployment that never started is a different failure from one that
    // stopped, and both belong at the top of the list rather than hidden.
    const res = await impl.getDashboard({ orgId }, ctx);
    const scout = res.agents.find((a: any) => a.id === agentId);
    expect(scout).toBeDefined();
    expect(scout.lastUsedAt).toBeUndefined();
  });

  it("draws recent activity from notes and comments, newest first", async () => {
    await task("t-act", "in-progress", "Worked on");
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();
    await db.insert(schema.taskNotes).values({
      id: "n-1", taskId: "t-act", agentId, content: "ran the migration", createdAt: older,
    });
    await db.insert(schema.comments).values({
      id: "c-1", entityId: "t-act", entityType: "task", agentId, content: "opened a PR", createdAt: newer,
    });

    const res = await impl.getDashboard({ orgId }, ctx);

    expect(res.recentActivity.map((a: any) => a.kind)).toEqual(["comment", "note"]);
    expect(res.recentActivity[0].agentName).toBe("Scout");
    expect(res.recentActivity[0].excerpt).toBe("opened a PR");
    expect(res.recentActivity[1].taskDisplayId).toBe("T-ACT");
  });

  it("does not leak another organization's work", async () => {
    const otherOrg = `org-other-${crypto.randomUUID()}`;
    const otherProject = `proj-other-${crypto.randomUUID()}`;
    const otherTemplate = `tmpl-other-${crypto.randomUUID()}`;
    await db.insert(schema.organizations).values({ id: otherOrg, name: "Other", slug: otherOrg, createdAt: new Date() });
    await db.insert(schema.organizationMembers).values({ orgId: otherOrg, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schema.projectTemplates).values({ id: otherTemplate, orgId: otherOrg, name: "T", createdAt: new Date() });
    await db.insert(schema.projects).values({
      id: otherProject, orgId: otherOrg, templateId: otherTemplate, name: "P2", key: "P2", ownerId: userId, createdAt: new Date(),
    });
    await db.insert(schema.tasks).values({
      id: "t-elsewhere", projectId: otherProject, displayId: "X-1", title: "Elsewhere", status: "todo", createdAt: new Date(),
    });
    await db.insert(schema.taskReviewers).values({ id: "rv-x", taskId: "t-elsewhere", userId });

    // The caller is a member of both, so this is a scoping check rather than an
    // authorization one — the join through `projects.orgId` is what confines it.
    const res = await impl.getDashboard({ orgId }, ctx);
    expect(res.awaitingReview).toHaveLength(0);
    expect(Number(res.awaitingReviewCount)).toBe(0);
  });

  it("narrows to one project when asked", async () => {
    await task("t-here", "todo");
    await db.insert(schema.taskReviewers).values({ id: "rv-h", taskId: "t-here", userId });

    const scoped = await impl.getDashboard({ orgId, projectId }, ctx);
    expect(scoped.awaitingReview.map((t: any) => t.id)).toEqual(["t-here"]);

    const elsewhere = await impl.getDashboard({ orgId, projectId: "proj-nonexistent" }, ctx);
    expect(elsewhere.awaitingReview).toHaveLength(0);
  });
});
