import { expect, test, describe } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createTasksHandler } from "./tasks.handler";

describe("Tasks Handler Integration Tests", () => {
  test("createTaskType can create, publish, and retrieve task types", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-handlertt-" + Date.now().toString();
    const userId = "user-handlertt-" + Date.now().toString();
    try {
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org Handler TT",
          slug: "test-org-handlertt-" + Date.now().toString(),
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
        await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    } catch {}
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

  test("createTaskManagementHandler can create/assign tasks", async () => {
    const { db, nc } = await setupIntegrationTest();

    const orgId = "org-taskman-" + Date.now().toString();
    const userId = "user-taskman-" + Date.now().toString();
    const templateId = "tmpl-taskman-" + Date.now().toString();
    const projectId = "proj-taskman-" + Date.now().toString();

    try {
        await db.insert(schemaSqlite.users).values({
          id: userId,
          email: "taskman@test.com",
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.organizations).values({
          id: orgId,
          name: "Test Org TaskMan",
          slug: "test-org-taskman-" + Date.now().toString(),
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
        await db.insert(schemaSqlite.projectTemplates).values({
          id: templateId,
          orgId: orgId,
          name: "Test Temp",
          createdAt: new Date(),
        });
        await db.insert(schemaSqlite.projects).values({
          id: projectId,
          orgId: orgId,
          templateId: templateId,
          ownerId: userId,
          name: "Test Proj",
          createdAt: new Date(),
        });
    } catch {}
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

    const listResp = await handler.listTasks({ projectId: projectId }, ctx);
    expect(listResp.tasks.length).toBeGreaterThan(0);
    expect(listResp.tasks.some((t: any) => t.title === "New Test Task")).toBe(true);

    await expect(handler.listTasks({}, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-taskman");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-taskman", email: "outsider-tm@test.com", createdAt: new Date() });
    await expect(handler.listTasks({ projectId }, outsiderCtx)).rejects.toThrow();
    await expect(handler.createTask({ projectId, title: "X" }, outsiderCtx)).rejects.toThrow();
    await expect(handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, outsiderCtx)).rejects.toThrow();

    // A legitimate org member trying to assign the task to an agentId that doesn't exist, or to a
    // user who isn't a member of this org, must be rejected too.
    await expect(handler.assignTask({ taskId: taskResp.task.id, agentId: "agent-does-not-exist" }, ctx)).rejects.toThrow();
    await expect(handler.assignTask({ taskId: taskResp.task.id, userId: "user-outsider-taskman" }, ctx)).rejects.toThrow();
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

    const addResp = await handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx);
    expect(addResp.success).toBe(true);

    // Adding the same reviewer again is idempotent.
    const addAgainResp = await handler.addTaskReviewer({ taskId: taskResp.task.id, userId: reviewerId }, ctx);
    expect(addAgainResp.success).toBe(true);

    const listResp = await handler.listTaskReviewers({ taskId: taskResp.task.id }, ctx);
    expect(listResp.reviewers.length).toBe(1);
    expect(listResp.reviewers[0].userId).toBe(reviewerId);

    // Cannot add a reviewer who isn't a member of the task's org.
    await expect(handler.addTaskReviewer({ taskId: taskResp.task.id, userId: outsiderId }, ctx)).rejects.toThrow();

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

    const listResp = await handler.listTasks({ projectId }, ctx);
    expect(listResp.tasks.find((t: any) => t.id === taskResp.task.id)?.status).toBe("in-progress");

    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "not-a-real-status" }, ctx)).rejects.toThrow();
    await expect(handler.updateTaskStatus({ taskId: "task-does-not-exist", status: "done" }, ctx)).rejects.toThrow();

    const outsiderCtx = makeAuthContext("user-outsider-status");
    await db.insert(schemaSqlite.users).values({ id: "user-outsider-status", email: "outsider-status@test.com", createdAt: new Date() });
    await expect(handler.updateTaskStatus({ taskId: taskResp.task.id, status: "done" }, outsiderCtx)).rejects.toThrow();
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
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, name: "Role", systemPrompt: "p", capabilities: "[]" });
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

    // Restoring/purging again fails since the row no longer exists.
    await expect(handler.restoreTask({ taskId }, makeAuthContext(adminId))).rejects.toThrow();
    expect(nc.publishedMessages.map((m: any) => m.subject)).toContain("domain.task.purged");
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

    // A status name that isn't one of this type's configured statuses is still rejected outright.
    await expect(
      taskHandler.updateTaskStatus({ taskId: created.task.id, status: "todo" }, ctx)
    ).rejects.toThrow();
  });
});
