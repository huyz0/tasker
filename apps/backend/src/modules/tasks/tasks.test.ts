import { expect, test, describe } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq, and, isNull } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTasksHandler, createTaskManagementHandler } from "./tasks.handler";
import { currentPrincipalKey } from "../auth/session";

describe("Tasks Handler Integration Tests", () => {
  test("createTaskType can create, publish, and retrieve task types", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-handlertt-" + Date.now().toString();
    const userId = "user-handlertt-" + Date.now().toString();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org Handler TT" });
    const ctx = makeAuthContext(userId);

    const handler = createTasksHandler(db, nc);

    const reqCreate = {
      orgId: orgId,
      projectId: null,
      name: "Integration Test Task",
    };

    const createResp = await handler.createTaskType(reqCreate, ctx);
    expect(createResp.taskType).toBeDefined();
    expect(createResp.taskType.name).toBe("Integration Test Task");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task_type.created");

    const getRes = await handler.getTaskType({ id: createResp.taskType.id }, ctx);
    expect(getRes.taskType).toBeDefined();
    expect(getRes.taskType.id).toBe(createResp.taskType.id);
    expect(getRes.taskType.name).toBe("Integration Test Task");

    await expect(handler.getTaskType({ id: createResp.taskType.id }, makeAuthContext("user-outsider"))).rejects.toThrow();

    // A projectId that belongs to a different org than the one requested must be rejected.
    const otherOrgId = "org-other-tt-" + Date.now();
    const otherUserId = "user-other-tt-" + Date.now();
    const otherTemplateId = "tmpl-other-tt-" + Date.now();
    const otherProjectId = "proj-other-tt-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-tt-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: otherTemplateId, orgId: otherOrgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId: otherOrgId, templateId: otherTemplateId, ownerId: otherUserId, name: "P", createdAt: new Date() });

    await expect(handler.createTaskType({ orgId, projectId: otherProjectId, name: "Cross" }, ctx)).rejects.toThrow();
  });

  test("createTaskType supports a parentId hierarchy, rejecting cross-org parents", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-tthier-" + Date.now().toString();
    const userId = "user-tthier-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "TT Hier Org", slug: "tt-hier-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });

    const ctx = makeAuthContext(userId);
    const handler = createTasksHandler(db, nc);

    const parentResp = await handler.createTaskType({ orgId, name: "Epic" }, ctx);
    const childResp = await handler.createTaskType({ orgId, name: "Story", parentId: parentResp.taskType.id }, ctx);
    expect(childResp.taskType.parentId).toBe(parentResp.taskType.id);

    await expect(handler.createTaskType({ orgId, name: "Bad", parentId: "tt-does-not-exist" }, ctx)).rejects.toThrow();

    const otherOrgId = "org-tthier-other-" + Date.now();
    const otherUserId = "user-tthier-other-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "tt-hier-other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    const otherParentResp = await handler.createTaskType({ orgId: otherOrgId, name: "Other Epic" }, makeAuthContext(otherUserId));

    await expect(handler.createTaskType({ orgId, name: "Cross-org child", parentId: otherParentResp.taskType.id }, ctx)).rejects.toThrow();

    // A project-scoped parent must stay within its own project's type tree -
    // a child scoped to a different project (even in the same org) must be rejected.
    const templateId = "tmpl-tthier-" + Date.now();
    const projectAId = "proj-tthier-a-" + Date.now();
    const projectBId = "proj-tthier-b-" + Date.now();
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectAId, orgId, templateId, ownerId: userId, name: "Project A", key: "PA-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectBId, orgId, templateId, ownerId: userId, name: "Project B", key: "PB-" + Date.now(), createdAt: new Date() });

    const projectScopedParent = await handler.createTaskType({ orgId, projectId: projectAId, name: "A-Epic" }, ctx);
    await expect(
      handler.createTaskType({ orgId, projectId: projectBId, name: "B-Story", parentId: projectScopedParent.taskType.id }, ctx)
    ).rejects.toThrow();

    // Same project is fine.
    const sameProjectChild = await handler.createTaskType({ orgId, projectId: projectAId, name: "A-Story", parentId: projectScopedParent.taskType.id }, ctx);
    expect(sameProjectChild.taskType.parentId).toBe(projectScopedParent.taskType.id);

    // An org-wide parent (no projectId) is reusable by any project's type.
    const orgWideParent = await handler.createTaskType({ orgId, name: "Org-wide Epic" }, ctx);
    const childUnderOrgWideParent = await handler.createTaskType({ orgId, projectId: projectBId, name: "B-Story-2", parentId: orgWideParent.taskType.id }, ctx);
    expect(childUnderOrgWideParent.taskType.parentId).toBe(orgWideParent.taskType.id);
  });

  test("listTaskTypes lists task types for an org, scoped by membership, with filter/sort support", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-listtt-" + Date.now().toString();
    const userId = "user-listtt-" + Date.now().toString();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "List TT Org", slug: "list-tt-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });

    const ctx = makeAuthContext(userId);
    const handler = createTasksHandler(db, nc);

    await handler.createTaskType({ orgId, name: "Zebra Type" }, ctx);
    await handler.createTaskType({ orgId, name: "Alpha Type" }, ctx);

    const listResp = await handler.listTaskTypes({ orgId }, ctx);
    expect(listResp.taskTypes.length).toBe(2);
    expect(listResp.page.totalCount).toBe(2);

    const filtered = await handler.listTaskTypes({ orgId, page: { filter: "Zebra" } }, ctx);
    expect(filtered.taskTypes.every((t: any) => t.name.includes("Zebra"))).toBe(true);

    const sorted = await handler.listTaskTypes({ orgId, page: { sort: "name:asc" } }, ctx);
    const names = sorted.taskTypes.map((t: any) => t.name);
    expect(names.indexOf("Alpha Type")).toBeLessThan(names.indexOf("Zebra Type"));

    await expect(handler.listTaskTypes({ orgId }, makeAuthContext("user-outsider-listtt"))).rejects.toThrow();
    await expect(handler.listTaskTypes({}, ctx)).rejects.toThrow();
  });

  // M14-T04: updateTaskType had zero test coverage before this - the
  // original deep review flagged it as an untested handler path.
  test("updateTaskType renames, reparents, and rejects a self-parent or a cross-org parent", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-updatett-" + Date.now().toString();
    const userId = "user-updatett-" + Date.now().toString();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org UpdateTT" });
    const ctx = makeAuthContext(userId);
    const handler = createTasksHandler(db, nc);

    const typeA = await handler.createTaskType({ orgId, name: "Original Name" }, ctx);
    const typeB = await handler.createTaskType({ orgId, name: "Would-be Parent" }, ctx);

    const renamed = await handler.updateTaskType({ id: typeA.taskType.id, name: "New Name" }, ctx);
    expect(renamed.taskType.name).toBe("New Name");
    expect(renamed.taskType.parentId).toBeFalsy();

    const reparented = await handler.updateTaskType({ id: typeA.taskType.id, parentId: typeB.taskType.id }, ctx);
    expect(reparented.taskType.parentId).toBe(typeB.taskType.id);
    // The name from the previous update must survive an update that only
    // touches parentId - updates are field-level, not a full overwrite.
    expect(reparented.taskType.name).toBe("New Name");

    // A type cannot become its own parent.
    await expect(
      handler.updateTaskType({ id: typeA.taskType.id, parentId: typeA.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // A nonexistent parent is rejected.
    await expect(
      handler.updateTaskType({ id: typeA.taskType.id, parentId: "tt-does-not-exist" }, ctx)
    ).rejects.toThrow();

    // A parent belonging to a different org is rejected.
    const otherOrgId = "org-updatett-other-" + Date.now();
    const otherUserId = "user-updatett-other-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: otherOrgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    const otherOrgType = await handler.createTaskType({ orgId: otherOrgId, name: "Foreign" }, makeAuthContext(otherUserId));
    await expect(
      handler.updateTaskType({ id: typeA.taskType.id, parentId: otherOrgType.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // A nonexistent type id is NotFound.
    await expect(
      handler.updateTaskType({ id: "tt-does-not-exist", name: "X" }, ctx)
    ).rejects.toMatchObject({ code: Code.NotFound });

    // An outsider cannot rename another org's task type.
    await expect(
      handler.updateTaskType({ id: typeA.taskType.id, name: "Hijacked" }, makeAuthContext(otherUserId))
    ).rejects.toThrow();
  });

  // M19-T03: updateTaskType checked cross-org parents but not the two other
  // ways reparenting can corrupt the tree - a project-scoped parent pulled
  // in from a different project (createTaskType already rejects this on
  // create, but reparenting an existing type skipped it entirely), and a
  // cycle (impossible on create, since a brand-new type can't already be its
  // own ancestor, but very possible once a type can be reparented).
  test("updateTaskType rejects reparenting across projects and into a cycle", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-updatett-cycle-" + Date.now().toString();
    const userId = "user-updatett-cycle-" + Date.now().toString();
    const templateId = "tmpl-updatett-cycle-" + Date.now().toString();
    const projectAId = "proj-updatett-cycle-a-" + Date.now().toString();
    const projectBId = "proj-updatett-cycle-b-" + Date.now().toString();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org UpdateTT Cycle" });
    // Both projects share one template - seedProject would try to insert
    // the same template row twice, so seed it once and add the second
    // project directly.
    await seedProject(db, { orgId, userId, templateId, projectId: projectAId, name: "Project A" });
    await db.insert(schemaSqlite.projects).values({ id: projectBId, orgId, templateId, ownerId: userId, name: "Project B", key: "PB-" + Date.now(), createdAt: new Date() });
    const ctx = makeAuthContext(userId);
    const handler = createTasksHandler(db, nc);

    // Project-scope: a project-scoped parent must stay within its own
    // project's type tree, exactly like createTaskType's own rule.
    const scopedToA = await handler.createTaskType({ orgId, projectId: projectAId, name: "A-Epic" }, ctx);
    const scopedToB = await handler.createTaskType({ orgId, projectId: projectBId, name: "B-Story" }, ctx);
    await expect(
      handler.updateTaskType({ id: scopedToB.taskType.id, parentId: scopedToA.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // An org-wide parent (no projectId) remains reusable across projects.
    const orgWide = await handler.createTaskType({ orgId, name: "Org-wide Epic" }, ctx);
    const reparented = await handler.updateTaskType({ id: scopedToB.taskType.id, parentId: orgWide.taskType.id }, ctx);
    expect(reparented.taskType.parentId).toBe(orgWide.taskType.id);

    // Cycle: Epic -> Story -> Task. Reparenting Epic under Task (its own
    // grandchild) must be rejected, not silently accepted and left as a
    // loop nothing that walks "up to the root" can ever terminate on.
    const epic = await handler.createTaskType({ orgId, name: "Epic" }, ctx);
    const story = await handler.createTaskType({ orgId, name: "Story", parentId: epic.taskType.id }, ctx);
    const task = await handler.createTaskType({ orgId, name: "Task", parentId: story.taskType.id }, ctx);

    await expect(
      handler.updateTaskType({ id: epic.taskType.id, parentId: task.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
    // The direct case (parent = immediate child) is also a cycle, one hop shorter.
    await expect(
      handler.updateTaskType({ id: epic.taskType.id, parentId: story.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // The tree is unchanged by the rejected attempts.
    const stillRoot = await handler.getTaskType({ id: epic.taskType.id }, ctx);
    expect(stillRoot.taskType.parentId).toBeFalsy();
  });

  test("createTaskManagementHandler can create/assign tasks", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-taskman-" + Date.now().toString();
    const userId = "user-taskman-" + Date.now().toString();
    const templateId = "tmpl-taskman-" + Date.now().toString();
    const projectId = "proj-taskman-" + Date.now().toString();

    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org TaskMan" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "Test Proj" });
    const ctx = makeAuthContext(userId);

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({
      projectId: projectId,
      title: "New Test Task",
      status: "todo",
      description: "testing",
    }, ctx);

    expect(taskResp.task).toBeDefined();
    expect(taskResp.task.title).toBe("New Test Task");

    // Proto3 can't distinguish an omitted string field from an empty one, so
    // the CLI/GUI always send status: "" when the caller didn't pick one -
    // that must still fall back to the "todo" default, not persist as "".
    const defaultStatusResp = await handler.createTask({
      projectId: projectId,
      title: "No Explicit Status",
      status: "",
    }, ctx);
    expect(defaultStatusResp.task.status).toBe("todo");

    const subjects = nc.publishedMessages.map((m: any) => m.subject);
    expect(subjects).toContain("domain.task.created");

    const assignResp = await handler.assignTask({
      taskId: taskResp.task.id,
      userId: userId,
    }, ctx);

    expect(assignResp.success).toBe(true);

    // Assigning the same user to the same task again is idempotent, not a
    // second accumulating row.
    const assignAgainResp = await handler.assignTask({
      taskId: taskResp.task.id,
      userId: userId,
    }, ctx);
    expect(assignAgainResp.success).toBe(true);

    const assignmentRows = await db.select().from(schemaSqlite.taskAssignments)
      .where(and(eq(schemaSqlite.taskAssignments.taskId, taskResp.task.id), eq(schemaSqlite.taskAssignments.userId, userId)));
    expect(assignmentRows.length).toBe(1);

    // Assigning the same agentId with a *different* userId must not be
    // misdetected as a duplicate of an earlier agentId+userId assignment -
    // both combinations are distinct rows.
    const agentRoleId = "role-assign-both-" + Date.now();
    const agentId = "agent-assign-both-" + Date.now();
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });
    const otherUserId = "user-assign-both-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: otherUserId, role: "member", joinedAt: new Date() });

    await handler.assignTask({ taskId: taskResp.task.id, agentId, userId }, ctx);
    await handler.assignTask({ taskId: taskResp.task.id, agentId, userId: otherUserId }, ctx);

    const bothRows = await db.select().from(schemaSqlite.taskAssignments)
      .where(and(eq(schemaSqlite.taskAssignments.taskId, taskResp.task.id), eq(schemaSqlite.taskAssignments.agentId, agentId)));
    expect(bothRows.length).toBe(2);
    expect(bothRows.map((r: any) => r.userId).sort()).toEqual([userId, otherUserId].sort());

    const listResp = await handler.listTasks({ projectId: projectId }, ctx);
    expect(listResp.tasks.length).toBeGreaterThan(0);
    expect(listResp.tasks.some((t: any) => t.title === "New Test Task")).toBe(true);

    // A negative limit must not bypass the page-size cap or blow up the query.
    const negativeLimitResp = await handler.listTasks({ projectId: projectId, page: { limit: -5 } }, ctx);
    expect(negativeLimitResp.tasks.length).toBeGreaterThan(0);

    await expect(handler.listTasks({}, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-taskman");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-taskman", email: "outsider-tm@test.com", createdAt: new Date() });
    await expect(handler.listTasks({ projectId }, outsiderCtx)).rejects.toThrow();
    await expect(handler.createTask({ projectId, title: "X" }, outsiderCtx)).rejects.toThrow();
    await expect(handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, outsiderCtx)).rejects.toThrow();

    // A legitimate org member trying to assign the task to an agentId that doesn't exist, or to a
    // user who isn't a member of this org, must be rejected too.
    await expect(handler.assignTask({ taskId: taskResp.task.id, agentId: "agent-does-not-exist" }, ctx)).rejects.toThrow();
    // A foreign/invalid assignee userId is the caller's own bad argument, not
    // a permission problem with the caller - must be InvalidArgument, not
    // PermissionDenied (which assertOrgMember would report if reused as-is).
    await expect(
      handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // Omitting both agentId and userId would otherwise create an orphaned
    // assignment row tied to nobody.
    await expect(handler.assignTask({ taskId: taskResp.task.id }, ctx)).rejects.toThrow();

    // M14-T04: an agent that exists but belongs to a *different* org is a
    // distinct rejection reason from "agent not found" - this branch had no
    // test coverage before.
    const crossOrgId = "org-assign-cross-" + Date.now();
    const crossOrgAgentRoleId = "role-assign-cross-" + Date.now();
    const crossOrgAgentId = "agent-assign-cross-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: crossOrgId, name: "Cross", slug: crossOrgId, createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: crossOrgAgentRoleId, orgId: crossOrgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: crossOrgAgentId, orgId: crossOrgId, agentRoleId: crossOrgAgentRoleId, name: "Cross-org Agent" });
    await expect(
      handler.assignTask({ taskId: taskResp.task.id, agentId: crossOrgAgentId }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // M14-T04: unassignTask had zero test coverage before this. Matched on
    // the exact (agentId: null, userId) pair - the plain userId assignment
    // made earlier, not the agentId+userId row that shares the same userId.
    await expect(handler.unassignTask({ taskId: taskResp.task.id, userId }, ctx)).resolves.toEqual({ success: true });
    const remaining = await db.select().from(schemaSqlite.taskAssignments).where(and(
      eq(schemaSqlite.taskAssignments.taskId, taskResp.task.id),
      eq(schemaSqlite.taskAssignments.userId, userId),
      isNull(schemaSqlite.taskAssignments.agentId),
    ));
    expect(remaining.length).toBe(0);
    // Removing an assignment that is no longer there is a no-op success,
    // not an error - and only touches the exact (agentId, userId) pair, not
    // the agent+otherUserId assignment made earlier in this same test.
    await expect(handler.unassignTask({ taskId: taskResp.task.id, userId }, ctx)).resolves.toEqual({ success: true });
    const untouched = await db.select().from(schemaSqlite.taskAssignments)
      .where(and(eq(schemaSqlite.taskAssignments.taskId, taskResp.task.id), eq(schemaSqlite.taskAssignments.agentId, agentId)));
    expect(untouched.length).toBe(2);

    await expect(handler.unassignTask({ taskId: taskResp.task.id }, ctx)).rejects.toThrow();
    await expect(
      handler.unassignTask({ taskId: taskResp.task.id, userId }, outsiderCtx)
    ).rejects.toThrow();
  });

  test("createTask records createdBy, and task reviewers can be added/listed/removed", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-reviewers-" + Date.now().toString();
    const userId = "user-reviewers-" + Date.now().toString();
    const reviewerId = "user-reviewer2-" + Date.now().toString();
    const outsiderId = "user-reviewer-outsider-" + Date.now().toString();
    const templateId = "tmpl-reviewers-" + Date.now().toString();
    const projectId = "proj-reviewers-" + Date.now().toString();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: reviewerId, email: `${reviewerId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Reviewers Org", slug: "reviewers-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: reviewerId, role: "member", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });

    const ctx = makeAuthContext(userId);
    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Reviewed Task", status: "todo", description: "" }, ctx);
    expect(taskResp.task.createdBy).toBe(userId);
    // M19-T02: createdAt used to be computed and then silently dropped
    // before the response left the handler.
    expect(typeof taskResp.task.createdAt).toBe("string");
    expect(taskResp.task.createdAt.length).toBeGreaterThan(0);

    const addResp = await handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx);
    expect(addResp.success).toBe(true);

    // Adding the same reviewer again is idempotent.
    const addAgainResp = await handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx);
    expect(addAgainResp.success).toBe(true);

    const listResp = await handler.listTaskReviewers({ taskId: taskResp.task.id }, ctx);
    expect(listResp.reviewers.length).toBe(1);
    expect(listResp.reviewers[0].userId).toBe(reviewerId);

    // Cannot add a reviewer who isn't a member of the task's org; reported as
    // InvalidArgument since userId (the reviewer) is bad input, not a caller auth failure.
    await expect(handler.addTaskReviewer({ taskId: taskResp.task.id, userId: outsiderId }, ctx))
      .rejects.toMatchObject({ code: Code.InvalidArgument });

    // Outsiders cannot manage or view reviewers on a task outside their org.
    const outsiderCtx = makeAuthContext(outsiderId);
    await expect(handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, outsiderCtx)).rejects.toThrow();
    await expect(handler.listTaskReviewers({ taskId: taskResp.task.id }, outsiderCtx)).rejects.toThrow();
    await expect(handler.removeTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, outsiderCtx)).rejects.toThrow();

    const removeResp = await handler.removeTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx);
    expect(removeResp.success).toBe(true);

    const listAfterRemove = await handler.listTaskReviewers({ taskId: taskResp.task.id }, ctx);
    expect(listAfterRemove.reviewers.length).toBe(0);
  });

  test("updateTaskStatus updates status for org members and rejects everyone else", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-status-" + Date.now().toString();
    const userId = "user-status-" + Date.now().toString();
    const templateId = "tmpl-status-" + Date.now().toString();
    const projectId = "proj-status-" + Date.now().toString();

    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Test Org Status", slug: "test-org-status-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "P", createdAt: new Date() });

    const ctx = makeAuthContext(userId);
    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Status Task", status: "todo", description: "" }, ctx);

    const updateResp = await handler.updateTaskStatus({ taskId: taskResp.task.id, status: "in-progress" }, ctx);
    expect(updateResp.task.status).toBe("in-progress");
    expect(typeof updateResp.task.createdAt).toBe("string");
    expect(updateResp.task.createdAt.length).toBeGreaterThan(0);

    const listResp = await handler.listTasks({ projectId }, ctx);
    const listedTask = listResp.tasks.find((t: any) => t.id === taskResp.task.id);
    expect(listedTask?.status).toBe("in-progress");
    expect(typeof listedTask?.createdAt).toBe("string");
    expect(listedTask?.createdAt.length).toBeGreaterThan(0);

    // M19-T02: listTasks used to validate its request by hand instead of
    // through a Zod schema, like every other RPC in this file.
    await expect(handler.listTasks({}, ctx)).rejects.toThrow();

    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "not-a-real-status" }, ctx)).rejects.toThrow();
    await expect(handler.updateTaskStatus({ taskId: "task-does-not-exist", status: "done" }, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-status");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-status", email: "outsider-status@test.com", createdAt: new Date() });
    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "done" }, outsiderCtx)).rejects.toThrow();
  });

  // M14-T02: two callers racing a status change used to both read the same
  // stale status, both pass validation against it, and both write - the
  // loser silently clobbered with no error to either side, and its own
  // response lied about the status it had "successfully" set. This is the
  // same interleaving the M03-T15 tests below prove is real on bun:sqlite
  // for plain awaited select-then-write calls with no transaction wrapping
  // them - exactly this code path.
  test("updateTaskStatus is safe under concurrent writers: exactly one racing change wins", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-status-race-" + Date.now().toString();
    const userId = "user-status-race-" + Date.now().toString();
    const templateId = "tmpl-status-race-" + Date.now().toString();
    const projectId = "proj-status-race-" + Date.now().toString();

    await seedOrgWithAdmin(db, { orgId, userId, name: "Status Race Org" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "P" });
    const ctx = makeAuthContext(userId);
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Race Task", status: "todo", description: "" }, ctx);

    // No task-type state machine is configured, so both targets are
    // independently valid transitions from "todo" - exactly the shape where
    // two agents racing to claim the same task by moving it out of "todo"
    // must not both be told they won.
    const results = await Promise.allSettled([
      handler.updateTaskStatus({ taskId: taskResp.task.id, status: "in-progress" }, ctx),
      handler.updateTaskStatus({ taskId: taskResp.task.id, status: "done" }, ctx),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toMatchObject({ code: Code.Aborted });

    // The persisted status matches the winner's own response, not "whoever
    // committed last, regardless of what either caller was told".
    const finalTask = await handler.getTask({ taskId: taskResp.task.id }, ctx);
    expect(finalTask.task.status).toBe(fulfilled[0].value.task.status);
  });

  test("deleteTask soft-deletes, hides from listTasks, and can be restored; requires org admin", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-delete-" + Date.now().toString();
    const adminId = "user-delete-admin-" + Date.now().toString();
    const memberId = "user-delete-member-" + Date.now().toString();
    const templateId = "tmpl-delete-" + Date.now().toString();
    const projectId = "proj-delete-" + Date.now().toString();

    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Delete Org", slug: "delete-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: adminId, name: "P", createdAt: new Date() });

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Delete Me", status: "todo", description: "" }, makeAuthContext(adminId));
    const taskId = taskResp.task.id;

    // A non-admin member cannot delete the task.
    await expect(handler.deleteTask({ taskId }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.deleteTask({ taskId }, makeAuthContext(adminId));

    const activeList = await handler.listTasks({ projectId }, makeAuthContext(adminId));
    expect(activeList.tasks.some((t: any) => t.id === taskId)).toBe(false);

    const binList = await handler.listTasks({ projectId, onlyDeleted: true }, makeAuthContext(adminId));
    expect(binList.tasks.some((t: any) => t.id === taskId)).toBe(true);

    // A non-admin member cannot restore either.
    await expect(handler.restoreTask({ taskId }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.restoreTask({ taskId }, makeAuthContext(adminId));
    const restoredList = await handler.listTasks({ projectId }, makeAuthContext(adminId));
    expect(restoredList.tasks.some((t: any) => t.id === taskId)).toBe(true);

    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.task.deleted");
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.task.restored");
  });

  test("purgeTask requires the task be archived first, cascades cleanup of dependent rows, and requires org admin", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-purge-" + Date.now().toString();
    const adminId = "user-purge-admin-" + Date.now().toString();
    const memberId = "user-purge-member-" + Date.now().toString();
    const templateId = "tmpl-purge-" + Date.now().toString();
    const projectId = "proj-purge-" + Date.now().toString();
    const folderId = "folder-purge-" + Date.now().toString();
    const artifactId = "art-purge-" + Date.now().toString();
    const repoLinkId = "repo-purge-" + Date.now().toString();

    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Purge Org", slug: "purge-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: adminId, name: "P", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });
    await db.insert(schemaSqlite.repositoryLinks).values({ id: repoLinkId, projectId, provider: "github", remoteName: "org/repo", accessTokenEncrypted: "enc", createdAt: new Date() });
    const agentRoleId = "role-purge-" + Date.now();
    const agentId = "agent-purge-" + Date.now();
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Purge Me", status: "todo", description: "" }, makeAuthContext(adminId));
    const taskId = taskResp.task.id;

    await db.insert(schemaSqlite.taskAssignments).values({ id: "ta-del-" + Date.now(), taskId, userId: memberId });
    await db.insert(schemaSqlite.taskReviewers).values({ id: "tr-del-" + Date.now(), taskId, userId: memberId });
    await db.insert(schemaSqlite.taskArtifactLinks).values({ id: "tal-del-" + Date.now(), taskId, artifactId });
    await db.insert(schemaSqlite.taskNotes).values({ id: "tn-del-" + Date.now(), taskId, agentId, content: "note", createdAt: new Date() });
    await db.insert(schemaSqlite.comments).values({ id: "cmt-del-" + Date.now(), entityId: taskId, entityType: "task", userId: memberId, content: "hi", createdAt: new Date() });
    const prId = "pr-del-" + Date.now();
    await db.insert(schemaSqlite.remotePullRequests).values({ id: prId, repositoryLinkId: repoLinkId, taskId, remotePrId: "1", title: "PR", status: "open", url: "http://x", updatedAt: new Date() });
    const labelId = "lbl-purge-" + Date.now();
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId, name: "purge-label", createdAt: new Date() });
    await db.insert(schemaSqlite.entityLabels).values({ id: "el-del-" + Date.now(), entityId: taskId, entityType: "task", labelId, createdAt: new Date() });

    // Cannot purge a live (non-archived) task.
    await expect(handler.purgeTask({ taskId }, makeAuthContext(adminId))).rejects.toThrow();

    await handler.deleteTask({ taskId }, makeAuthContext(adminId));

    // A non-admin member cannot purge either.
    await expect(handler.purgeTask({ taskId }, makeAuthContext(memberId))).rejects.toThrow();

    await handler.purgeTask({ taskId }, makeAuthContext(adminId));

    const remainingAssignments = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, taskId));
    expect(remainingAssignments.length).toBe(0);

    const remainingReviewers = await db.select().from(schemaSqlite.taskReviewers).where(eq(schemaSqlite.taskReviewers.taskId, taskId));
    expect(remainingReviewers.length).toBe(0);

    const remainingLinks = await db.select().from(schemaSqlite.taskArtifactLinks).where(eq(schemaSqlite.taskArtifactLinks.taskId, taskId));
    expect(remainingLinks.length).toBe(0);

    const remainingComments = await db.select().from(schemaSqlite.comments).where(eq(schemaSqlite.comments.entityId, taskId));
    expect(remainingComments.length).toBe(0);

    const remainingNotes = await db.select().from(schemaSqlite.taskNotes).where(eq(schemaSqlite.taskNotes.taskId, taskId));
    expect(remainingNotes.length).toBe(0);

    const remainingPrs = await db.select().from(schemaSqlite.remotePullRequests).where(eq(schemaSqlite.remotePullRequests.id, prId));
    expect(remainingPrs.length).toBe(1);
    expect(remainingPrs[0].taskId).toBeNull();

    const remainingEntityLabels = await db.select().from(schemaSqlite.entityLabels).where(and(eq(schemaSqlite.entityLabels.entityId, taskId), eq(schemaSqlite.entityLabels.entityType, "task")));
    expect(remainingEntityLabels.length).toBe(0);

    // Restoring/purging again fails since the row no longer exists.
    await expect(handler.restoreTask({ taskId }, makeAuthContext(adminId))).rejects.toThrow();
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.task.purged");
  });

  test("restoreTask and purgeTask still resolve an orgId (and succeed) when the task's project is itself archived", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-archived-proj-" + Date.now();
    const adminId = "user-archived-proj-admin-" + Date.now();
    const templateId = "tmpl-archived-proj-" + Date.now();
    const projectId = "proj-archived-proj-" + Date.now();

    await db.insert(schemaSqlite.users).values({ id: adminId, email: `${adminId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "archived-proj-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: adminId, name: "P", createdAt: new Date() });

    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const restoreTaskResp = await handler.createTask({ projectId, title: "To Restore", status: "todo", description: "" }, makeAuthContext(adminId));
    const purgeTaskResp = await handler.createTask({ projectId, title: "To Purge", status: "todo", description: "" }, makeAuthContext(adminId));
    // Both tasks are archived while the project is still live - archiveTask
    // isn't part of what's under test here and, correctly, does need the
    // project to still resolve without includeDeleted.
    await handler.deleteTask({ taskId: restoreTaskResp.task.id }, makeAuthContext(adminId));
    await handler.deleteTask({ taskId: purgeTaskResp.task.id }, makeAuthContext(adminId));

    // Archive the project itself - getTaskOrgId must still resolve an orgId
    // for each task (to check admin permission) instead of misreporting
    // "Project not found" because getProjectOrgId's default filters
    // archived projects out.
    await db.update(schemaSqlite.projects).set({ deletedAt: new Date() }).where(eq(schemaSqlite.projects.id, projectId));

    await expect(handler.restoreTask({ taskId: restoreTaskResp.task.id }, makeAuthContext(adminId))).resolves.toEqual({ success: true });
    await expect(handler.purgeTask({ taskId: purgeTaskResp.task.id }, makeAuthContext(adminId))).resolves.toEqual({ success: true });
  });

  test("assigns each task a stable, human-readable displayId derived from the project's key", async () => {
    const { db, nc } = await setupIntegrationTest();
    const { createProjectsHandler, createProjectTemplatesHandler } = require("../projects/projects.handler");

    const orgId = "org-displayid-" + Date.now();
    const userId = "user-displayid-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Display Id Org", slug: "displayid-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);

    const pHandler = createProjectsHandler(db, nc);
    const ptHandler = createProjectTemplatesHandler(db, nc);
    const tResp = await ptHandler.createTemplate({ orgId, name: "T", description: "" }, ctx);
    const pResp = await pHandler.createProject({ orgId, templateId: tResp.template.id, name: "Backend Services", ownerId: userId }, ctx);
    expect(pResp.project.key).toBe("BS");

    const { createTaskManagementHandler } = require("./tasks.handler");
    const taskHandler = createTaskManagementHandler(db, nc);
    const task1 = await taskHandler.createTask({ projectId: pResp.project.id, title: "First", status: "todo", description: "" }, ctx);
    const task2 = await taskHandler.createTask({ projectId: pResp.project.id, title: "Second", status: "todo", description: "" }, ctx);

    expect(task1.task.displayId).toBe("BS-1");
    expect(task2.task.displayId).toBe("BS-2");
  });

  // M14-T05: agent self-service - an agent needs to find claimable work
  // without paging every task and filtering client-side, and needs to be
  // able to ask "what's assigned to me" without being trusted to supply its
  // own id (which would let one principal read another's queue).
  test("listTasks filters by assigneeFilter: unassigned finds claimable work, me resolves the calling principal", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-assigneefilter-" + Date.now();
    const adminId = "user-assigneefilter-" + Date.now();
    const templateId = "tmpl-assigneefilter-" + Date.now();
    const projectId = "proj-assigneefilter-" + Date.now();
    const agentRoleId = "role-assigneefilter-" + Date.now();
    const agentId = "agent-assigneefilter-" + Date.now();
    const otherAgentId = "agent-assigneefilter-other-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "Assignee Filter Org" });
    await seedProject(db, { orgId, userId: adminId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });
    await db.insert(schemaSqlite.agents).values({ id: otherAgentId, orgId, agentRoleId, name: "Other Agent" });

    const ctx = makeAuthContext(adminId);
    const handler = createTaskManagementHandler(db, nc);
    const agentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-test", scopes: ["tasks:read", "tasks:write"] });
      return v;
    })() } as any;

    const unclaimed = await handler.createTask({ projectId, title: "Unclaimed", status: "todo", description: "" }, ctx);
    const mine = await handler.createTask({ projectId, title: "Mine", status: "todo", description: "" }, ctx);
    const someoneElses = await handler.createTask({ projectId, title: "Someone Else's", status: "todo", description: "" }, ctx);

    await handler.assignTask({ taskId: mine.task.id, agentId }, ctx);
    await handler.assignTask({ taskId: someoneElses.task.id, agentId: otherAgentId }, ctx);

    const unassignedResp = await handler.listTasks({ projectId, assigneeFilter: "unassigned" }, ctx);
    expect(unassignedResp.tasks.map((t: any) => t.id)).toEqual([unclaimed.task.id]);

    // "me" resolved from the agent's own token, not a field in the request -
    // there is nowhere in ListTasksRequest to even name a different agent.
    const mineResp = await handler.listTasks({ projectId, assigneeFilter: "me" }, agentCtx);
    expect(mineResp.tasks.map((t: any) => t.id)).toEqual([mine.task.id]);

    // A human's "me" resolves against userId, not agentId - the admin has no
    // assignments here at all.
    const humanMineResp = await handler.listTasks({ projectId, assigneeFilter: "me" }, ctx);
    expect(humanMineResp.tasks.length).toBe(0);

    // No filter returns everything, same as before this field existed.
    const allResp = await handler.listTasks({ projectId }, ctx);
    expect(allResp.tasks.length).toBe(3);

    await expect(handler.listTasks({ projectId, assigneeFilter: "bogus" }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  // M14-T06: the atomic claim primitive - the missing half of "an agent can
  // discover and take work with no human broker". claimTask always assigns
  // the *calling* principal; there is no field to claim on someone else's
  // behalf.
  test("claimTask atomically assigns the calling principal, only on an unassigned task", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-claim-" + Date.now();
    const adminId = "user-claim-" + Date.now();
    const templateId = "tmpl-claim-" + Date.now();
    const projectId = "proj-claim-" + Date.now();
    const agentRoleId = "role-claim-" + Date.now();
    const agentId = "agent-claim-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "Claim Org" });
    await seedProject(db, { orgId, userId: adminId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });

    const ctx = makeAuthContext(adminId);
    const handler = createTaskManagementHandler(db, nc);
    const agentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-test", scopes: ["tasks:read", "tasks:write"] });
      return v;
    })() } as any;

    const task = await handler.createTask({ projectId, title: "Claimable", status: "todo", description: "" }, ctx);

    const claimed = await handler.claimTask({ taskId: task.task.id }, agentCtx);
    expect(claimed.task.id).toBe(task.task.id);
    expect(typeof claimed.task.createdAt).toBe("string");
    expect(claimed.task.createdAt.length).toBeGreaterThan(0);

    const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, task.task.id));
    expect(rows.length).toBe(1);
    expect(rows[0].agentId).toBe(agentId);
    expect(rows[0].userId).toBeFalsy();

    // Claiming an already-claimed task is a typed conflict, not a second,
    // silent assignment - even for the same principal claiming again.
    await expect(handler.claimTask({ taskId: task.task.id }, agentCtx)).rejects.toMatchObject({ code: Code.FailedPrecondition });

    const otherTask = await handler.createTask({ projectId, title: "Also Claimable", status: "todo", description: "" }, ctx);
    // A human can claim their own work too - claimTask isn't agent-only,
    // just self-only.
    const humanClaimed = await handler.claimTask({ taskId: otherTask.task.id }, ctx);
    expect(humanClaimed.task.id).toBe(otherTask.task.id);
    const humanRows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, otherTask.task.id));
    expect(humanRows[0].userId).toBe(adminId);
    expect(humanRows[0].agentId).toBeFalsy();

    await expect(handler.claimTask({ taskId: "task-does-not-exist" }, agentCtx)).rejects.toMatchObject({ code: Code.NotFound });

    const outsiderId = "user-claim-outsider-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    const thirdTask = await handler.createTask({ projectId, title: "Guarded", status: "todo", description: "" }, ctx);
    await expect(handler.claimTask({ taskId: thirdTask.task.id }, makeAuthContext(outsiderId))).rejects.toThrow();

    // An agent token without tasks:write cannot claim, even for itself.
    const readOnlyAgentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-ro", scopes: ["tasks:read"] });
      return v;
    })() } as any;
    await expect(handler.claimTask({ taskId: thirdTask.task.id }, readOnlyAgentCtx)).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  // M22-T04 (ADR-0017): the whole point of this milestone - claiming a task
  // that has a prior handoff note surfaces it in the same round trip.
  test("claimTask returns the task's latest handoff note when one exists", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-claimhandoff-" + Date.now();
    const adminId = "user-claimhandoff-" + Date.now();
    const templateId = "tmpl-claimhandoff-" + Date.now();
    const projectId = "proj-claimhandoff-" + Date.now();
    const agentRoleId = "role-claimhandoff-" + Date.now();
    const agentId = "agent-claimhandoff-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "Claim Handoff Org" });
    await seedProject(db, { orgId, userId: adminId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });

    const ctx = makeAuthContext(adminId);
    const handler = createTaskManagementHandler(db, nc);
    const agentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-test", scopes: ["tasks:read", "tasks:write"] });
      return v;
    })() } as any;

    const task = await handler.createTask({ projectId, title: "Was handed off", status: "todo", description: "" }, ctx);

    // No handoff note yet - claimTask's own response carries no such field.
    const noNote = await handler.claimTask({ taskId: task.task.id }, agentCtx);
    expect(noNote.latestHandoffNote).toBeUndefined();
    await handler.unassignTask({ taskId: task.task.id, agentId }, ctx);

    await db.insert(schemaSqlite.taskNotes).values({
      id: "tnt-older-" + Date.now(), taskId: task.task.id, agentId, content: "older handoff", createdAt: new Date(Date.now() - 60_000), noteType: "handoff",
    });
    await db.insert(schemaSqlite.taskNotes).values({
      id: "tnt-newer-" + Date.now(), taskId: task.task.id, agentId, content: "blocked on review, next: rerun tests", createdAt: new Date(), noteType: "handoff",
    });
    await db.insert(schemaSqlite.taskNotes).values({
      id: "tnt-comment-" + Date.now(), taskId: task.task.id, agentId, content: "just a comment", createdAt: new Date(), noteType: "comment",
    });

    const claimed = await handler.claimTask({ taskId: task.task.id }, agentCtx);
    expect(claimed.latestHandoffNote).toBeDefined();
    expect(claimed.latestHandoffNote.content).toBe("blocked on review, next: rerun tests");
    expect(claimed.latestHandoffNote.noteType).toBe("handoff");
    expect(typeof claimed.latestHandoffNote.createdAt).toBe("string");
  });

  // M14-T06: the whole point - fires N concurrent claims at the same
  // unassigned task and proves exactly one wins, the same shape M03-T15
  // proved for createTask's counter claim.
  test("claimTask is race-safe: exactly one of several concurrent claims on the same task wins", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-claimrace-" + Date.now();
    const adminId = "user-claimrace-" + Date.now();
    const templateId = "tmpl-claimrace-" + Date.now();
    const projectId = "proj-claimrace-" + Date.now();
    const agentRoleId = "role-claimrace-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "Claim Race Org" });
    await seedProject(db, { orgId, userId: adminId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });

    const ctx = makeAuthContext(adminId);
    const handler = createTaskManagementHandler(db, nc);
    const task = await handler.createTask({ projectId, title: "Contested", status: "todo", description: "" }, ctx);

    const agentIds = Array.from({ length: 5 }, (_, i) => `agent-claimrace-${i}-${Date.now()}`);
    for (const agentId of agentIds) {
      await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: agentId });
    }
    const agentCtxs = agentIds.map((agentId) => ({ values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-" + agentId, scopes: ["tasks:read", "tasks:write"] });
      return v;
    })() } as any));

    const results = await Promise.allSettled(agentCtxs.map((c) => handler.claimTask({ taskId: task.task.id }, c)));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(4);
    for (const r of rejected as PromiseRejectedResult[]) {
      expect(r.reason).toMatchObject({ code: Code.FailedPrecondition });
    }

    const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, task.task.id));
    expect(rows.length).toBe(1);
  });

  // M14-T07: retry-safety. The realistic failure mode is a client timing
  // out, the mutation having already succeeded, and retrying sequentially
  // once it regains control - not two truly simultaneous calls (that
  // narrower case is documented as open in lib/idempotency.ts and in this
  // milestone's PROGRESS.md).
  test("createTask with an idempotencyKey replays the original task instead of creating a duplicate", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-idem-create-" + Date.now();
    const userId = "user-idem-create-" + Date.now();
    const templateId = "tmpl-idem-create-" + Date.now();
    const projectId = "proj-idem-create-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId, name: "Idem Create Org" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "P" });
    const ctx = makeAuthContext(userId);
    const handler = createTaskManagementHandler(db, nc);

    const first = await handler.createTask({ projectId, title: "Once Only", status: "todo", description: "", idempotencyKey: "retry-key-1" }, ctx);
    const replay = await handler.createTask({ projectId, title: "Once Only", status: "todo", description: "", idempotencyKey: "retry-key-1" }, ctx);
    expect(replay.task.id).toBe(first.task.id);
    expect(replay.task.displayId).toBe(first.task.displayId);

    const rows = await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.projectId, projectId));
    expect(rows.length).toBe(1);

    // A *different* key from the same principal creates a genuinely new task.
    const second = await handler.createTask({ projectId, title: "A Different Task", status: "todo", description: "", idempotencyKey: "retry-key-2" }, ctx);
    expect(second.task.id).not.toBe(first.task.id);

    // The same key string from a *different* principal is not a collision -
    // each caller's idempotency keys live in their own namespace.
    const otherUserId = "user-idem-create-other-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    const third = await handler.createTask(
      { projectId, title: "Same Key Different Caller", status: "todo", description: "", idempotencyKey: "retry-key-1" },
      makeAuthContext(otherUserId),
    );
    expect(third.task.id).not.toBe(first.task.id);

    const allRows = await db.select().from(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.projectId, projectId));
    expect(allRows.length).toBe(3);

    // No key at all behaves exactly as before this field existed - every
    // call creates a new task.
    const fourth = await handler.createTask({ projectId, title: "Once Only", status: "todo", description: "" }, ctx);
    const fifth = await handler.createTask({ projectId, title: "Once Only", status: "todo", description: "" }, ctx);
    expect(fourth.task.id).not.toBe(fifth.task.id);
  });

  test("claimTask with an idempotencyKey replays success instead of FailedPrecondition on a retried claim", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-idem-claim-" + Date.now();
    const adminId = "user-idem-claim-" + Date.now();
    const templateId = "tmpl-idem-claim-" + Date.now();
    const projectId = "proj-idem-claim-" + Date.now();
    const agentRoleId = "role-idem-claim-" + Date.now();
    const agentId = "agent-idem-claim-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "Idem Claim Org" });
    await seedProject(db, { orgId, userId: adminId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });

    const handler = createTaskManagementHandler(db, nc);
    const agentCtx = { values: (() => {
      const v = createContextValues();
      v.set(currentPrincipalKey, { kind: "agent", agentId, orgId, tokenId: "tok-test", scopes: ["tasks:read", "tasks:write"] });
      return v;
    })() } as any;

    const task = await handler.createTask({ projectId, title: "Claim Me", status: "todo", description: "" }, makeAuthContext(adminId));

    const first = await handler.claimTask({ taskId: task.task.id, idempotencyKey: "claim-retry-1" }, agentCtx);
    expect(first.task.id).toBe(task.task.id);

    // Without idempotency this would be FailedPrecondition (already
    // claimed) - the whole point is that a client that timed out on the
    // first response and retried does not see that.
    const replay = await handler.claimTask({ taskId: task.task.id, idempotencyKey: "claim-retry-1" }, agentCtx);
    expect(replay.task.id).toBe(task.task.id);

    const rows = await db.select().from(schemaSqlite.taskAssignments).where(eq(schemaSqlite.taskAssignments.taskId, task.task.id));
    expect(rows.length).toBe(1);

    // A genuinely new claim attempt (no key, or a different key) on an
    // already-claimed task still fails normally - idempotency replays a
    // specific prior call, it does not make claiming reentrant.
    await expect(handler.claimTask({ taskId: task.task.id }, agentCtx)).rejects.toMatchObject({ code: Code.FailedPrecondition });
    await expect(handler.claimTask({ taskId: task.task.id, idempotencyKey: "a-different-key" }, agentCtx)).rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  test("enforces a task type's configured status enum and transition state machine", async () => {
    const { db, nc } = await setupIntegrationTest();
    const { createProjectsHandler, createProjectTemplatesHandler } = require("../projects/projects.handler");
    const { createTaskManagementHandler } = require("./tasks.handler");

    const orgId = "org-statemachine-" + Date.now();
    const userId = "user-statemachine-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "State Machine Org", slug: "statemachine-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    const ctx = makeAuthContext(userId);

    const typesHandler = createTasksHandler(db, nc);
    const pHandler = createProjectsHandler(db, nc);
    const ptHandler = createProjectTemplatesHandler(db, nc);
    const taskHandler = createTaskManagementHandler(db, nc);

    const tResp = await ptHandler.createTemplate({ orgId, name: "T", description: "" }, ctx);
    const pResp = await pHandler.createProject({ orgId, templateId: tResp.template.id, name: "Support Queue", ownerId: userId }, ctx);

    const typeResp = await typesHandler.createTaskType({ orgId, projectId: pResp.project.id, name: "Ticket" }, ctx);
    const taskTypeId = typeResp.taskType.id;

    // No statuses configured yet - falls back to the default enum.
    const beforeStatuses = await taskHandler.createTask({ projectId: pResp.project.id, title: "Early", status: "todo", taskTypeId }, ctx);
    expect(beforeStatuses.task.taskTypeId).toBe(taskTypeId);
    await expect(taskHandler.createTask({ projectId: pResp.project.id, title: "Bad", status: "bogus", taskTypeId }, ctx)).rejects.toThrow();

    const openStatus = await typesHandler.createTaskStatus({ taskTypeId, name: "open" }, ctx);
    const inReviewStatus = await typesHandler.createTaskStatus({ taskTypeId, name: "in_review" }, ctx);
    await typesHandler.createTaskStatus({ taskTypeId, name: "closed" }, ctx);

    await expect(
      typesHandler.createTaskStatus({ taskTypeId: "does-not-exist", name: "x" }, ctx)
    ).rejects.toThrow();

    // A duplicate status name for the same task type would let
    // validateStatusForTaskType's name lookup silently resolve to the wrong
    // row, hiding transition edges configured against the other duplicate.
    await expect(
      typesHandler.createTaskStatus({ taskTypeId, name: "open" }, ctx)
    ).rejects.toThrow();

    // Creating a task with a status outside the now-configured enum is rejected.
    await expect(
      taskHandler.createTask({ projectId: pResp.project.id, title: "Wrong Status", status: "todo", taskTypeId }, ctx)
    ).rejects.toThrow();

    const created = await taskHandler.createTask({ projectId: pResp.project.id, title: "Ticket 1", status: "open", taskTypeId }, ctx);
    expect(created.task.status).toBe("open");

    // No transitions configured yet - only status membership is enforced, so any configured status is reachable.
    const toClosedDirect = await taskHandler.updateTaskStatus({ taskId: created.task.id, status: "closed" }, ctx);
    expect(toClosedDirect.task.status).toBe("closed");
    await taskHandler.updateTaskStatus({ taskId: created.task.id, status: "open" }, ctx);

    const transition = await typesHandler.createTaskStatusTransition({
      taskTypeId,
      fromStatusId: openStatus.status.id,
      toStatusId: inReviewStatus.status.id,
    }, ctx);
    expect(transition.transition.id).toBeDefined();

    // Creating the exact same transition again is idempotent, not a second
    // accumulating row.
    const dupTransition = await typesHandler.createTaskStatusTransition({
      taskTypeId,
      fromStatusId: openStatus.status.id,
      toStatusId: inReviewStatus.status.id,
    }, ctx);
    expect(dupTransition.transition.id).toBe(transition.transition.id);

    const transitionRows = await db.select().from(schemaSqlite.taskStatusTransitions)
      .where(and(
        eq(schemaSqlite.taskStatusTransitions.taskTypeId, taskTypeId),
        eq(schemaSqlite.taskStatusTransitions.fromStatusId, openStatus.status.id),
        eq(schemaSqlite.taskStatusTransitions.toStatusId, inReviewStatus.status.id),
      ));
    expect(transitionRows.length).toBe(1);

    await expect(
      typesHandler.createTaskStatusTransition({ taskTypeId, fromStatusId: "bad-id", toStatusId: inReviewStatus.status.id }, ctx)
    ).rejects.toThrow();
    await expect(
      typesHandler.createTaskStatusTransition({ taskTypeId, fromStatusId: openStatus.status.id, toStatusId: "bad-id" }, ctx)
    ).rejects.toThrow();

    // Now that a transition graph exists, an edge not in it is rejected...
    await expect(
      taskHandler.updateTaskStatus({ taskId: created.task.id, status: "closed" }, ctx)
    ).rejects.toThrow();

    // ...while the configured edge succeeds.
    const toInReview = await taskHandler.updateTaskStatus({ taskId: created.task.id, status: "in_review" }, ctx);
    expect(toInReview.task.status).toBe("in_review");

    // Re-submitting the same status is always a no-op success, even with a
    // transition graph configured and no self-loop edge for it.
    const noOp = await taskHandler.updateTaskStatus({ taskId: created.task.id, status: "in_review" }, ctx);
    expect(noOp.task.status).toBe("in_review");

    // A status name that isn't one of this type's configured statuses is still rejected outright.
    await expect(
      taskHandler.updateTaskStatus({ taskId: created.task.id, status: "todo" }, ctx)
    ).rejects.toThrow();
  });

  // M19-T03: createTaskStatus's own duplicate-name check is select-then-
  // insert, same race window M18-T03 closed for folders/artifacts. This
  // forces the race by firing two identical calls concurrently, rather than
  // relying on the pre-check alone.
  test("rejects one of two concurrent createTaskStatus calls racing for the same name, as AlreadyExists rather than a raw DB error", async () => {
    const { db, nc } = await setupIntegrationTest();
    const orgId = "org-status-race-" + Date.now();
    const userId = "user-status-race-" + Date.now();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Status Race Org" });
    const ctx = makeAuthContext(userId);
    const typesHandler = createTasksHandler(db, nc);

    const taskType = await typesHandler.createTaskType({ orgId, name: "Race Type" }, ctx);

    const results = await Promise.allSettled([
      typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "open" }, ctx),
      typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "open" }, ctx),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(Code.AlreadyExists);
  });

  // Same race, on addTaskReviewer's own duplicate check - a benign no-op
  // either way (the reviewer ends up added exactly once), so unlike the
  // status case above, both calls succeed rather than one being rejected.
  test("both of two concurrent addTaskReviewer calls for the same reviewer succeed, leaving exactly one row", async () => {
    const { db, nc } = await setupIntegrationTest();
    const orgId = "org-reviewer-race-" + Date.now();
    const userId = "user-reviewer-race-" + Date.now();
    const reviewerId = "user-reviewer-race-target-" + Date.now();
    const templateId = "tmpl-reviewer-race-" + Date.now();
    const projectId = "proj-reviewer-race-" + Date.now();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Reviewer Race Org" });
    await db.insert(schemaSqlite.users).values({ id: reviewerId, email: `${reviewerId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: reviewerId, role: "member", joinedAt: new Date() });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "Reviewer Race Project" });
    const ctx = makeAuthContext(userId);
    const { createTaskManagementHandler } = require("./tasks.handler");
    const handler = createTaskManagementHandler(db, nc);

    const taskResp = await handler.createTask({ projectId, title: "Race Task", status: "todo", description: "" }, ctx);

    const results = await Promise.allSettled([
      handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx),
      handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const rows = await db.select().from(schemaSqlite.taskReviewers)
      .where(and(eq(schemaSqlite.taskReviewers.taskId, taskResp.task.id), eq(schemaSqlite.taskReviewers.userId, reviewerId)));
    expect(rows).toHaveLength(1);
  });

  // M14-T04: deleteTaskStatusTransition had zero test coverage before this.
  test("deleteTaskStatusTransition removes an edge, is idempotent, and is authorized against the type", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-deltrans-" + Date.now();
    const userId = "user-deltrans-" + Date.now();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Del Trans Org" });
    const ctx = makeAuthContext(userId);
    const typesHandler = createTasksHandler(db, nc);

    const taskType = await typesHandler.createTaskType({ orgId, name: "Workflow" }, ctx);
    const open = await typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "open" }, ctx);
    const closed = await typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "closed" }, ctx);
    const transition = await typesHandler.createTaskStatusTransition({
      taskTypeId: taskType.taskType.id, fromStatusId: open.status.id, toStatusId: closed.status.id,
    }, ctx);

    await expect(
      typesHandler.deleteTaskStatusTransition({ taskTypeId: taskType.taskType.id, transitionId: transition.transition.id }, ctx)
    ).resolves.toEqual({ success: true });

    const rows = await db.select().from(schemaSqlite.taskStatusTransitions)
      .where(eq(schemaSqlite.taskStatusTransitions.id, transition.transition.id));
    expect(rows.length).toBe(0);

    // Deleting an edge that is already gone is a no-op success, not an error.
    await expect(
      typesHandler.deleteTaskStatusTransition({ taskTypeId: taskType.taskType.id, transitionId: transition.transition.id }, ctx)
    ).resolves.toEqual({ success: true });

    // A nonexistent task type is rejected before any authorization check runs.
    await expect(
      typesHandler.deleteTaskStatusTransition({ taskTypeId: "tt-does-not-exist", transitionId: transition.transition.id }, ctx)
    ).rejects.toMatchObject({ code: Code.NotFound });

    // An outsider cannot delete a transition on another org's task type,
    // even naming a transitionId that no longer exists.
    const outsiderId = "user-deltrans-outsider-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    await expect(
      typesHandler.deleteTaskStatusTransition(
        { taskTypeId: taskType.taskType.id, transitionId: transition.transition.id },
        makeAuthContext(outsiderId),
      )
    ).rejects.toThrow();
  });

  // M14-T04: reorderTaskStatuses had zero test coverage before this.
  test("reorderTaskStatuses demands the complete list and rejects a partial or foreign one", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-reorder-" + Date.now();
    const userId = "user-reorder-" + Date.now();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Reorder Org" });
    const ctx = makeAuthContext(userId);
    const typesHandler = createTasksHandler(db, nc);

    const taskType = await typesHandler.createTaskType({ orgId, name: "Pipeline" }, ctx);
    const s1 = await typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "todo" }, ctx);
    const s2 = await typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "doing" }, ctx);
    const s3 = await typesHandler.createTaskStatus({ taskTypeId: taskType.taskType.id, name: "done" }, ctx);

    const reordered = await typesHandler.reorderTaskStatuses({
      taskTypeId: taskType.taskType.id,
      statusIds: [s3.status.id, s1.status.id, s2.status.id],
    }, ctx);
    expect(reordered.statuses.map((s: any) => s.id)).toEqual([s3.status.id, s1.status.id, s2.status.id]);

    // A partial list (missing one of this type's statuses) is rejected -
    // silently accepting it would leave the omitted status at a stale
    // position, which is how two statuses end up sharing one.
    await expect(
      typesHandler.reorderTaskStatuses({ taskTypeId: taskType.taskType.id, statusIds: [s1.status.id, s2.status.id] }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // A duplicate id in the list is rejected.
    await expect(
      typesHandler.reorderTaskStatuses(
        { taskTypeId: taskType.taskType.id, statusIds: [s1.status.id, s1.status.id, s2.status.id] }, ctx
      )
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // A foreign id (not one of this type's statuses) is rejected.
    await expect(
      typesHandler.reorderTaskStatuses(
        { taskTypeId: taskType.taskType.id, statusIds: [s1.status.id, s2.status.id, "tst-does-not-exist"] }, ctx
      )
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // A nonexistent task type is NotFound.
    await expect(
      typesHandler.reorderTaskStatuses({ taskTypeId: "tt-does-not-exist", statusIds: ["tst-does-not-exist"] }, ctx)
    ).rejects.toMatchObject({ code: Code.NotFound });

    const outsiderId = "user-reorder-outsider-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    await expect(
      typesHandler.reorderTaskStatuses(
        { taskTypeId: taskType.taskType.id, statusIds: [s3.status.id, s1.status.id, s2.status.id] },
        makeAuthContext(outsiderId),
      )
    ).rejects.toThrow();
  });

  // M14-T01: `description` has proto3 `optional` presence tracking, so the
  // wire can and does distinguish "field omitted" from "field explicitly set
  // to empty". A Zod preprocess step that collapsed both into "not provided"
  // made clearing a description a silent no-op - the request returned 2xx
  // and the field never changed. This test reads the value back through
  // `getTask` rather than trusting `updateTask`'s own response.
  test("updateTask persists field changes, including clearing description to empty", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createTaskManagementHandler(db, nc);

    const orgId = "org-updatetask-" + Date.now().toString();
    const userId = "user-updatetask-" + Date.now().toString();
    const templateId = "tmpl-updatetask-" + Date.now().toString();
    const projectId = "proj-updatetask-" + Date.now().toString();

    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org UpdateTask" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "Test Proj" });
    const ctx = makeAuthContext(userId);

    const created = await handler.createTask({
      projectId, title: "Original Title", description: "Original description",
    }, ctx);

    // Change title and description together.
    const updated = await handler.updateTask({
      taskId: created.task.id, title: "New Title", description: "New description",
    }, ctx);
    expect(updated.task.title).toBe("New Title");
    expect(updated.task.description).toBe("New description");
    expect(typeof updated.task.createdAt).toBe("string");
    expect(updated.task.createdAt.length).toBeGreaterThan(0);

    // Clearing the description to "" must actually persist as "", not be
    // silently dropped because it looks like an unset field.
    const cleared = await handler.updateTask({
      taskId: created.task.id, title: "New Title", description: "",
    }, ctx);
    expect(cleared.task.description).toBe("");

    // Read it back through a second call, not the mutation's own echo.
    const refetched = await handler.getTask({ taskId: created.task.id }, ctx);
    expect(refetched.task.description).toBe("");
    expect(refetched.task.title).toBe("New Title");

    // Omitting title/description entirely (only taskId + taskTypeId) must
    // leave both untouched.
    const typesHandler = createTasksHandler(db, nc);
    const newType = await typesHandler.createTaskType({ orgId, name: "Retyped" }, ctx);
    const retyped = await handler.updateTask({ taskId: created.task.id, taskTypeId: newType.taskType.id }, ctx);
    expect(retyped.task.title).toBe("New Title");
    expect(retyped.task.description).toBe("");
    expect(retyped.task.taskTypeId).toBe(newType.taskType.id);

    // A taskTypeId belonging to a different org is rejected.
    const otherOrgId = "org-updatetask-other-" + Date.now();
    const otherUserId = "user-updatetask-other-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: otherOrgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    const otherOrgType = await typesHandler.createTaskType({ orgId: otherOrgId, name: "Foreign" }, makeAuthContext(otherUserId));
    await expect(
      handler.updateTask({ taskId: created.task.id, taskTypeId: otherOrgType.taskType.id }, ctx)
    ).rejects.toThrow();

    // A task that does not exist is NotFound, not a generic throw.
    await expect(
      handler.updateTask({ taskId: "task-does-not-exist", title: "X" }, ctx)
    ).rejects.toMatchObject({ code: Code.NotFound });

    // An outsider (not a member of this org) cannot update the task.
    const outsiderId = "user-updatetask-outsider-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    await expect(
      handler.updateTask({ taskId: created.task.id, title: "Hijacked" }, makeAuthContext(outsiderId))
    ).rejects.toThrow();
  });

  // M19-T03: createTaskType already refuses to let a project-scoped type
  // parent a different project's type - createTask/updateTask had never
  // checked the same thing for the type actually attached to a task, so a
  // type scoped to Project A could freely be attached to a task in Project
  // B (same org). An org-wide type (projectId null) stays valid everywhere.
  test("createTask and updateTask reject a taskTypeId scoped to a different project", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createTaskManagementHandler(db, nc);
    const typesHandler = createTasksHandler(db, nc);

    const orgId = "org-tasktype-scope-" + Date.now().toString();
    const userId = "user-tasktype-scope-" + Date.now().toString();
    const templateId = "tmpl-tasktype-scope-" + Date.now().toString();
    const projectAId = "proj-tasktype-scope-a-" + Date.now().toString();
    const projectBId = "proj-tasktype-scope-b-" + Date.now().toString();
    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org TaskType Scope" });
    // Both projects share one template - seedProject would try to insert
    // the same template row twice, so seed it once and add the second
    // project directly.
    await seedProject(db, { orgId, userId, templateId, projectId: projectAId, name: "Project A" });
    await db.insert(schemaSqlite.projects).values({ id: projectBId, orgId, templateId, ownerId: userId, name: "Project B", key: "PB-" + Date.now(), createdAt: new Date() });
    const ctx = makeAuthContext(userId);

    const scopedToA = await typesHandler.createTaskType({ orgId, projectId: projectAId, name: "A-only Type" }, ctx);

    await expect(
      handler.createTask({ projectId: projectBId, title: "Wrong Project", status: "todo", taskTypeId: scopedToA.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });

    // Same project is fine.
    const created = await handler.createTask({ projectId: projectAId, title: "Right Project", status: "todo", taskTypeId: scopedToA.taskType.id }, ctx);
    expect(created.task.taskTypeId).toBe(scopedToA.taskType.id);

    // An org-wide type (no projectId) is usable by any project.
    const orgWideType = await typesHandler.createTaskType({ orgId, name: "Org-wide Type" }, ctx);
    const createdOrgWide = await handler.createTask({ projectId: projectBId, title: "Org-wide Type Task", status: "todo", taskTypeId: orgWideType.taskType.id }, ctx);
    expect(createdOrgWide.task.taskTypeId).toBe(orgWideType.taskType.id);

    // updateTask enforces the same rule against the task's own project - a
    // task in B cannot be retyped to a type scoped to A.
    await expect(
      handler.updateTask({ taskId: createdOrgWide.task.id, taskTypeId: scopedToA.taskType.id }, ctx)
    ).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("getTask returns the full task including description, and denies non-members", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createTaskManagementHandler(db, nc);

    const orgId = "org-gettask-" + Date.now().toString();
    const userId = "user-gettask-" + Date.now().toString();
    const templateId = "tmpl-gettask-" + Date.now().toString();
    const projectId = "proj-gettask-" + Date.now().toString();

    await seedOrgWithAdmin(db, { orgId, userId, name: "Test Org GetTask" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "Test Proj" });
    const ctx = makeAuthContext(userId);

    const created = await handler.createTask({
      projectId, title: "Gettable", description: "Has a body",
    }, ctx);

    const fetched = await handler.getTask({ taskId: created.task.id }, ctx);
    expect(fetched.task.id).toBe(created.task.id);
    expect(fetched.task.title).toBe("Gettable");
    expect(fetched.task.description).toBe("Has a body");
    expect(Array.isArray(fetched.task.assignees)).toBe(true);
    expect(typeof fetched.task.createdAt).toBe("string");
    expect(fetched.task.createdAt.length).toBeGreaterThan(0);
    // M22-T04 (ADR-0017): no handoff note recorded for this task.
    expect(fetched.latestHandoffNote).toBeUndefined();

    await expect(handler.getTask({ taskId: "task-does-not-exist" }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
    await expect(handler.getTask({}, ctx)).rejects.toThrow();

    const outsiderId = "user-gettask-outsider-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: outsiderId, email: `${outsiderId}@test.com`, createdAt: new Date() });
    await expect(handler.getTask({ taskId: created.task.id }, makeAuthContext(outsiderId))).rejects.toThrow();
  });

  // M22-T04 (ADR-0017): inspecting a task surfaces prior handoff context
  // without a separate listTaskNotes call.
  test("getTask returns the task's latest handoff note when one exists", async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createTaskManagementHandler(db, nc);

    const orgId = "org-gettaskhandoff-" + Date.now();
    const userId = "user-gettaskhandoff-" + Date.now();
    const templateId = "tmpl-gettaskhandoff-" + Date.now();
    const projectId = "proj-gettaskhandoff-" + Date.now();
    const agentRoleId = "role-gettaskhandoff-" + Date.now();
    const agentId = "agent-gettaskhandoff-" + Date.now();

    await seedOrgWithAdmin(db, { orgId, userId, name: "GetTask Handoff Org" });
    await seedProject(db, { orgId, userId, templateId, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: "Agent" });
    const ctx = makeAuthContext(userId);

    const created = await handler.createTask({ projectId, title: "Mid-handoff" }, ctx);
    await db.insert(schemaSqlite.taskNotes).values({
      id: "tnt-gettask-older-" + Date.now(), taskId: created.task.id, agentId, content: "older handoff", createdAt: new Date(Date.now() - 60_000), noteType: "handoff",
    });
    await db.insert(schemaSqlite.taskNotes).values({
      id: "tnt-gettask-newer-" + Date.now(), taskId: created.task.id, agentId, content: "current understanding: X, next: Y", createdAt: new Date(), noteType: "handoff",
    });

    const fetched = await handler.getTask({ taskId: created.task.id }, ctx);
    expect(fetched.latestHandoffNote).toBeDefined();
    expect(fetched.latestHandoffNote.content).toBe("current understanding: X, next: Y");
    expect(typeof fetched.latestHandoffNote.createdAt).toBe("string");
  });
});

describe("Concurrent task creation (M03-T15)", () => {
  /**
   * `createTask` claims a project's next task number inside a transaction and
   * builds the display id from it. On bun:sqlite that transaction did nothing:
   * drizzle hands the callback to `client.transaction(fn)`, which commits as
   * soon as `fn` returns, and an `async` callback returns a promise
   * immediately - so the COMMIT landed before the read-modify-write had run.
   *
   * The effect was not subtle. Eight concurrent creates against one project all
   * returned `ENG-1`: every task in the project sharing one human-readable id,
   * which is the id people paste into chat and search for.
   *
   * Found while fixing the same shape in purgeOrg (M03-T03).
   */
  const seedProjectForTasks = async () => {
    const { db, nc } = await setupIntegrationTest();
    const handler = createTaskManagementHandler(db, nc);
    const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-conc-" + suffix;
    const userId = "user-conc-" + suffix;
    const templateId = "tmpl-conc-" + suffix;
    const projectId = "proj-conc-" + suffix;

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Conc Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@t.local`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({
      id: projectId, orgId, templateId, ownerId: userId, name: "P", key: "ENG", nextTaskNumber: 1, createdAt: new Date(),
    });
    return { db, handler, projectId, ctx: makeAuthContext(userId) };
  };

  test("concurrent creates each claim a distinct task number", async () => {
    const { handler, projectId, ctx } = await seedProjectForTasks();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => handler.createTask({ projectId, title: `Task ${i}` }, ctx)),
    );

    const displayIds = results.map((r: any) => r.task.displayId);
    expect(new Set(displayIds).size).toBe(displayIds.length);
    expect([...displayIds].sort()).toEqual(
      ["ENG-1", "ENG-2", "ENG-3", "ENG-4", "ENG-5", "ENG-6", "ENG-7", "ENG-8"].sort(),
    );
  });

  test("the project's counter ends where the claims did", async () => {
    const { db, handler, projectId, ctx } = await seedProjectForTasks();

    await Promise.all(Array.from({ length: 5 }, (_, i) => handler.createTask({ projectId, title: `T${i}` }, ctx)));

    // A counter that lags behind hands out ids that are unique today and
    // collide with the next batch.
    const [project] = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId));
    expect(project.nextTaskNumber).toBe(6);
  });

  test("sequential creates still number consecutively", async () => {
    const { handler, projectId, ctx } = await seedProjectForTasks();

    const first: any = await handler.createTask({ projectId, title: "one" }, ctx);
    const second: any = await handler.createTask({ projectId, title: "two" }, ctx);

    expect(first.task.displayId).toBe("ENG-1");
    expect(second.task.displayId).toBe("ENG-2");
  });
});
