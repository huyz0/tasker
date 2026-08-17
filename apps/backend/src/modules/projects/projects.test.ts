import { expect, test, describe, beforeAll } from "bun:test";
import { Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { create, toJson } from "@bufbuild/protobuf";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createProjectsHandler, createProjectTemplatesHandler } from "./projects.handler";
import { createTasksHandler, createTaskManagementHandler } from "../tasks/tasks.handler";
import { ProjectSchema } from "shared-contract/gen/ts/tasker/health/v1/health_pb";

describe("Projects Handler Integration Logic", () => {
  let db: any;
  let mockNc: any;
  let pHandler: any;
  let ptHandler: any;
  let ctx: any;

  beforeAll(async () => {
     const setup = await setupIntegrationTest();
     db = setup.db;
     mockNc = setup.nc;
     pHandler = createProjectsHandler(db, mockNc);
     ptHandler = createProjectTemplatesHandler(db, mockNc);
     ctx = makeAuthContext("user-test");

     // Quick setup
     try {
       await db.insert(schemaSqlite.organizations).values({
         id: "org-test",
         name: "Test Org",
         slug: "test-org",
         createdAt: new Date()
       });
       await db.insert(schemaSqlite.users).values({
         id: "user-test",
         email: "test@example.com",
         createdAt: new Date()
       });
       await db.insert(schemaSqlite.organizationMembers).values({
         orgId: "org-test",
         userId: "user-test",
         role: "admin",
         joinedAt: new Date(),
       });
     } catch {
        // May already exist
     }
  });

  test("can insert a template and then a project via handlers", async () => {
     const tResp = await ptHandler.createTemplate({
         orgId: "org-test",
         name: "Test Template",
         description: "A test pt"
     }, ctx);

     expect(tResp.template.id).toBeDefined();
     expect(tResp.template.name).toBe("Test Template");
     // M20-T02: createdAt used to be computed for listTemplates only and
     // silently dropped everywhere else - Project/ProjectTemplate had no
     // field to put it on at all.
     expect(typeof tResp.template.createdAt).toBe("string");
     expect(tResp.template.createdAt.length).toBeGreaterThan(0);

     const pResp = await pHandler.createProject({
         orgId: "org-test",
         templateId: tResp.template.id,
         name: "Test Project",
         ownerId: "user-test"
     }, ctx);

     expect(pResp.project.id).toBeDefined();
     expect(pResp.project.name).toBe("Test Project");
     expect(typeof pResp.project.createdAt).toBe("string");
     expect(pResp.project.createdAt.length).toBeGreaterThan(0);
     expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.created");

     // Fetch project
     const fetchProj = await pHandler.getProject({ id: pResp.project.id }, ctx);
     expect(fetchProj.project.name).toBe("Test Project");
     expect(typeof fetchProj.project.createdAt).toBe("string");

     // Fetch template
     const fetchTpl = await ptHandler.getTemplate({ id: tResp.template.id }, ctx);
     expect(fetchTpl.template.name).toBe("Test Template");
     expect(typeof fetchTpl.template.createdAt).toBe("string");

     // Test 404 throws
     expect(pHandler.getProject({ id: "invalid-id" }, ctx)).rejects.toThrow();
     expect(ptHandler.getTemplate({ id: "invalid-id" }, ctx)).rejects.toThrow();

     // Test listProjects
     const listRes = await pHandler.listProjects({ orgId: "org-test" }, ctx);
     expect(listRes.projects.length).toBeGreaterThan(0);
     expect(listRes.projects.some((p: any) => p.name === "Test Project")).toBe(true);
     expect(listRes.projects.every((p: any) => typeof p.createdAt === "string" && p.createdAt.length > 0)).toBe(true);

     expect(pHandler.listProjects({}, ctx)).rejects.toThrow();
  });

  // M16-T01: no description field existed on a project at all before this.
  test("createProject stores a description, and updateProject can set, clear, or leave it untouched", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Desc Template" }, ctx);

    const created = await pHandler.createProject({
      orgId: "org-test", templateId: tResp.template.id, name: "Desc Project", ownerId: "user-test",
      description: "Ships the thing",
    }, ctx);
    expect(created.project.description).toBe("Ships the thing");

    // Read it back through a second call, not the mutation's own echo.
    const fetched = await pHandler.getProject({ id: created.project.id }, ctx);
    expect(fetched.project.description).toBe("Ships the thing");

    // Omitting description on create defaults to "", not undefined/null -
    // the same default createTask uses.
    const createdNoDesc = await pHandler.createProject({
      orgId: "org-test", templateId: tResp.template.id, name: "No Desc Project", ownerId: "user-test",
    }, ctx);
    expect(createdNoDesc.project.description).toBe("");

    // Updating name alone must not touch description - unset means "don't
    // touch it", the same distinction M14-T01 fixed for tasks.
    const renamedOnly = await pHandler.updateProject({ projectId: created.project.id, name: "Renamed Desc Project" }, ctx);
    expect(renamedOnly.project.description).toBe("Ships the thing");
    expect(typeof renamedOnly.project.createdAt).toBe("string");
    expect((await pHandler.getProject({ id: created.project.id }, ctx)).project.description).toBe("Ships the thing");

    // An explicit empty string clears it.
    const cleared = await pHandler.updateProject({ projectId: created.project.id, name: "Renamed Desc Project", description: "" }, ctx);
    expect(cleared.project.description).toBe("");
    expect((await pHandler.getProject({ id: created.project.id }, ctx)).project.description).toBe("");

    // And a non-empty value updates it normally.
    const updated = await pHandler.updateProject({ projectId: created.project.id, name: "Renamed Desc Project", description: "New description" }, ctx);
    expect(updated.project.description).toBe("New description");
  });

  test("createTemplate can set and validate a rootTaskTypeId", async () => {
    const ttHandler = createTasksHandler(db, mockNc);
    const typeResp = await ttHandler.createTaskType({ orgId: "org-test", name: "Root Type" }, ctx);

    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Rooted Template", rootTaskTypeId: typeResp.taskType.id }, ctx);
    expect(tResp.template.rootTaskTypeId).toBe(typeResp.taskType.id);

    await expect(ptHandler.createTemplate({ orgId: "org-test", name: "Bad Root", rootTaskTypeId: "tt-does-not-exist" }, ctx)).rejects.toThrow();

    const otherOrgId = "org-roottpl-other-" + Date.now();
    const otherUserId = "user-roottpl-other-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "roottpl-other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    const otherTypeResp = await ttHandler.createTaskType({ orgId: otherOrgId, name: "Other Root Type" }, makeAuthContext(otherUserId));

    await expect(ptHandler.createTemplate({ orgId: "org-test", name: "Cross-org Root", rootTaskTypeId: otherTypeResp.taskType.id }, ctx)).rejects.toThrow();
  });

  test("derives a short project key from the name and de-duplicates on collision", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Key Template", description: "" }, ctx);

    const first = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Engineering Docs", ownerId: "user-test" }, ctx);
    expect(first.project.key).toBe("ED");

    // Same name again in the same org must not collide on the key.
    const second = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Engineering Docs", ownerId: "user-test" }, ctx);
    expect(second.project.key).toBe("ED2");
    expect(second.project.key).not.toBe(first.project.key);
  });

  test("retries with a fresh key when a concurrent request wins the race for the same candidate", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Race Template", description: "" }, ctx);

    // Simulate two concurrent requests racing for the same key: the real
    // unique index (projects_org_id_key_idx) is what actually prevents the
    // duplicate, and createProject must catch that conflict and retry with a
    // fresh candidate instead of surfacing the raw DB error.
    let insertCalls = 0;
    const realInsert = db.insert.bind(db);
    const racyDb = Object.assign(Object.create(Object.getPrototypeOf(db)), db, {
      insert: (table: any) => {
        const original = realInsert(table);
        return Object.assign(Object.create(Object.getPrototypeOf(original)), original, {
          values: async (payload: any) => {
            if (table === schemaSqlite.projects && insertCalls === 0) {
              insertCalls++;
              throw new Error("UNIQUE constraint failed: projects_org_id_key_idx");
            }
            return original.values(payload);
          },
        });
      },
    });

    const racyHandler = createProjectsHandler(racyDb, mockNc);
    const resp = await racyHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Race Condition", ownerId: "user-test" }, ctx);

    expect(resp.project).toBeDefined();
    expect(insertCalls).toBe(1);

    const listed = await pHandler.listProjects({ orgId: "org-test" }, ctx);
    expect(listed.projects.filter((p: any) => p.id === resp.project.id)).toHaveLength(1);
  });

  test("rejects access from a user who isn't a member of the org", async () => {
     const outsiderCtx = makeAuthContext("user-outsider");
     await db.insert(schemaSqlite.users).values({ id: "user-outsider", email: "outsider@example.com", createdAt: new Date() });

     await expect(pHandler.listProjects({ orgId: "org-test" }, outsiderCtx)).rejects.toThrow();
     await expect(pHandler.createProject({ orgId: "org-test", templateId: "t-1", name: "X", ownerId: "user-outsider" }, outsiderCtx)).rejects.toThrow();
     await expect(pHandler.listProjects({}, makeAuthContext(null))).rejects.toThrow();
  });

  test("rejects createProject when ownerId isn't a member of the org", async () => {
     const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Owner Check Tpl" }, ctx);
     const nonMemberId = "user-not-a-member-" + Date.now();
     await db.insert(schemaSqlite.users).values({ id: nonMemberId, email: `${nonMemberId}@example.com`, createdAt: new Date() });
     await expect(pHandler.createProject({
       orgId: "org-test", templateId: tResp.template.id, name: "X", ownerId: nonMemberId,
     }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  test("rejects createProject with a nonexistent templateId", async () => {
     await expect(pHandler.createProject({
       orgId: "org-test", templateId: "template-does-not-exist", name: "X", ownerId: "user-test",
     }, ctx)).rejects.toThrow();
  });

  test("rejects createProject when the template belongs to a different org", async () => {
     const otherOrgId = "org-other-tpl-" + Date.now();
     const otherUserId = "user-other-tpl-" + Date.now();
     await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-tpl-" + Date.now(), createdAt: new Date() });
     await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
     await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
     const otherTpl = await ptHandler.createTemplate({ orgId: otherOrgId, name: "Other Tpl" }, makeAuthContext(otherUserId));

     // The template genuinely exists, but belongs to a different org than the one being asked to create a project in.
     await expect(pHandler.createProject({
       orgId: "org-test", templateId: otherTpl.template.id, name: "X", ownerId: "user-test",
     }, ctx)).rejects.toThrow();
  });

  test("can list templates for an org, scoped by membership", async () => {
    await ptHandler.createTemplate({ orgId: "org-test", name: "Listable Template" }, ctx);
    const res = await ptHandler.listTemplates({ orgId: "org-test" }, ctx);
    expect(res.templates.some((t: any) => t.name === "Listable Template")).toBe(true);
    expect(res.templates.every((t: any) => typeof t.createdAt === "string" && t.createdAt.length > 0)).toBe(true);

    await expect(ptHandler.listTemplates({}, ctx)).rejects.toThrow();
    await expect(ptHandler.listTemplates({ orgId: "org-test" }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  test("listTemplates supports filter and sort by name", async () => {
    await ptHandler.createTemplate({ orgId: "org-test", name: "Zebra Template" }, ctx);
    await ptHandler.createTemplate({ orgId: "org-test", name: "Aardvark Template" }, ctx);

    const filtered = await ptHandler.listTemplates({ orgId: "org-test", page: { filter: "Zebra" } }, ctx);
    expect(filtered.templates.every((t: any) => t.name.includes("Zebra"))).toBe(true);
    expect(filtered.templates.length).toBeGreaterThan(0);

    const sorted = await ptHandler.listTemplates({ orgId: "org-test", page: { sort: "name:asc" } }, ctx);
    const names = sorted.templates.map((t: any) => t.name);
    expect(names.indexOf("Aardvark Template")).toBeLessThan(names.indexOf("Zebra Template"));
  });

  test("archiveProject hides the project from listProjects and restoreProject brings it back, admin-only", async () => {
    const memberId = "user-archive-member-" + Date.now();
    await db.insert(schemaSqlite.users).values({ id: memberId, email: `${memberId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: "org-test", userId: memberId, role: "member", joinedAt: new Date() });

    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Archive Template" }, ctx);
    const pResp = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Archive Me", ownerId: "user-test" }, ctx);

    await expect(pHandler.archiveProject({ projectId: pResp.project.id }, makeAuthContext(memberId))).rejects.toThrow();

    await pHandler.archiveProject({ projectId: pResp.project.id }, ctx);

    const activeList = await pHandler.listProjects({ orgId: "org-test" }, ctx);
    expect(activeList.projects.some((p: any) => p.id === pResp.project.id)).toBe(false);

    const binList = await pHandler.listProjects({ orgId: "org-test", onlyDeleted: true }, ctx);
    expect(binList.projects.some((p: any) => p.id === pResp.project.id)).toBe(true);
    const binnedProject = binList.projects.find((p: any) => p.id === pResp.project.id);
    // M20-T01: deletedAt used to come back as a raw JS Date, not the ISO
    // string the wire model declares - a Date is not a bug a handler-level
    // unit test catches on its own (`typeof` still reports "object" either
    // way from bun:test's point of view unless asserted precisely), so this
    // also round-trips through the real protobuf encoder below, which is
    // what actually threw against a live server.
    expect(typeof binnedProject.deletedAt).toBe("string");
    expect(() => toJson(ProjectSchema, create(ProjectSchema, binnedProject))).not.toThrow();

    const gotArchived = await pHandler.getProject({ id: pResp.project.id }, ctx);
    expect(typeof gotArchived.project.deletedAt).toBe("string");
    expect(() => toJson(ProjectSchema, create(ProjectSchema, gotArchived.project))).not.toThrow();

    await expect(pHandler.restoreProject({ projectId: pResp.project.id }, makeAuthContext(memberId))).rejects.toThrow();

    await pHandler.restoreProject({ projectId: pResp.project.id }, ctx);
    const restoredList = await pHandler.listProjects({ orgId: "org-test" }, ctx);
    expect(restoredList.projects.some((p: any) => p.id === pResp.project.id)).toBe(true);

    expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.archived");
    expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.restored");

    await expect(pHandler.archiveProject({ projectId: "project-does-not-exist" }, ctx)).rejects.toThrow();
  });

  test("purgeProject requires the project be archived and empty (no tasks/folders/repo links)", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Purge Template" }, ctx);
    const pResp = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Purge Me", ownerId: "user-test" }, ctx);

    // Cannot purge a live project.
    await expect(pHandler.purgeProject({ projectId: pResp.project.id }, ctx)).rejects.toThrow();

    await pHandler.archiveProject({ projectId: pResp.project.id }, ctx);

    const taskId = "tsk-purge-proj-" + Date.now();
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId: pResp.project.id, title: "T", status: "todo", createdAt: new Date() });
    await expect(pHandler.purgeProject({ projectId: pResp.project.id }, ctx)).rejects.toThrow();
    await db.delete(schemaSqlite.tasks).where(eq(schemaSqlite.tasks.id, taskId));

    await pHandler.purgeProject({ projectId: pResp.project.id }, ctx);

    const afterPurge = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, pResp.project.id));
    expect(afterPurge.length).toBe(0);
    expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.purged");
  });

  // M14-T03: archiveProject only soft-deletes the project row - it never
  // touches the project's own tasks. Archiving a project that still has
  // live tasks used to be a dead end with no path back through the API:
  // deleteTask's default org lookup excluded archived projects and
  // reported "Project not found" for a perfectly live task, while
  // purgeProject refused to run while any task row remained (including
  // ones that could never be reached to remove). This proves the whole
  // admin cleanup workflow - archive, then delete and purge each leftover
  // task, then purge the project - actually completes.
  test("archiving a project with live tasks does not dead-end: tasks can still be deleted and purged afterward", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Deadlock Template" }, ctx);
    const pResp = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Deadlock Me", ownerId: "user-test" }, ctx);
    const taskHandler = createTaskManagementHandler(db, mockNc);

    const taskResp = await taskHandler.createTask({ projectId: pResp.project.id, title: "Still Live", status: "todo", description: "" }, ctx);

    // Archive the project while the task is still live - this must not
    // silently strand the task.
    await pHandler.archiveProject({ projectId: pResp.project.id }, ctx);

    // Before the fix this threw "Project not found" even though the task
    // itself was never touched.
    await expect(taskHandler.deleteTask({ taskId: taskResp.task.id }, ctx)).resolves.toEqual({ success: true });
    await expect(taskHandler.purgeTask({ taskId: taskResp.task.id }, ctx)).resolves.toEqual({ success: true });
    await expect(pHandler.purgeProject({ projectId: pResp.project.id }, ctx)).resolves.toEqual({ success: true });
  });

  test("restoreProject rejects restoring into an archived organization", async () => {
    const orgId = "org-restore-archived-" + Date.now();
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Restore Archived Org", slug: "restore-archived-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: "user-test", role: "admin", joinedAt: new Date() });
    const tResp = await ptHandler.createTemplate({ orgId, name: "Restore Archived Template" }, ctx);
    const pResp = await pHandler.createProject({ orgId, templateId: tResp.template.id, name: "Restore Archived Project", ownerId: "user-test" }, ctx);

    await pHandler.archiveProject({ projectId: pResp.project.id }, ctx);
    // Now archive the org itself too.
    await db.update(schemaSqlite.organizations).set({ deletedAt: new Date() }).where(eq(schemaSqlite.organizations.id, orgId));

    await expect(pHandler.restoreProject({ projectId: pResp.project.id }, ctx)).rejects.toMatchObject({ code: Code.FailedPrecondition });
  });

  test("purgeProject removes project-scoped task types instead of leaving them orphaned", async () => {
    const tResp = await ptHandler.createTemplate({ orgId: "org-test", name: "Purge TT Template" }, ctx);
    const pResp = await pHandler.createProject({ orgId: "org-test", templateId: tResp.template.id, name: "Purge TT Me", ownerId: "user-test" }, ctx);

    const taskHandler = createTasksHandler(db, mockNc);
    const typeResp = await taskHandler.createTaskType({ orgId: "org-test", projectId: pResp.project.id, name: "Ticket" }, ctx);
    const statusResp = await taskHandler.createTaskStatus({ taskTypeId: typeResp.taskType.id, name: "open" }, ctx);
    const status2Resp = await taskHandler.createTaskStatus({ taskTypeId: typeResp.taskType.id, name: "closed" }, ctx);
    await taskHandler.createTaskStatusTransition({ taskTypeId: typeResp.taskType.id, fromStatusId: statusResp.status.id, toStatusId: status2Resp.status.id }, ctx);

    await pHandler.archiveProject({ projectId: pResp.project.id }, ctx);
    await pHandler.purgeProject({ projectId: pResp.project.id }, ctx);

    expect((await db.select().from(schemaSqlite.taskTypes).where(eq(schemaSqlite.taskTypes.id, typeResp.taskType.id))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.taskStatuses).where(eq(schemaSqlite.taskStatuses.taskTypeId, typeResp.taskType.id))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.taskStatusTransitions).where(eq(schemaSqlite.taskStatusTransitions.taskTypeId, typeResp.taskType.id))).length).toBe(0);
  });
});

// M10-T10. getProject/updateProject/archiveProject/restoreProject/
// purgeProject check {type: 'project', id} rather than {type:
// 'organization', id: orgId} - can()'s own project→org ancestor climbing
// (M10-T04) already made an org-level grant keep working (proven above,
// every existing test in this file uses only organization_members-based
// org membership and none of it broke), so this group proves the new,
// narrower half: a project-scoped grant works *without* any org-level
// access at all, and stays isolated to that one project.
describe("Project-scope grants (M10-T10)", () => {
  test("a project-scoped grant reaches the project, with no organization membership at all", async () => {
    const { db } = await setupIntegrationTest();
    const handler = createProjectsHandler(db, null);
    const ptHandler2 = createProjectTemplatesHandler(db, null);

    const orgId = "org-t10-scope";
    const ownerId = "user-t10-owner";
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "T10 Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: ownerId, role: "admin", joinedAt: new Date() });
    const tResp = await ptHandler2.createTemplate({ orgId, name: "Scope Template" }, makeAuthContext(ownerId));
    const pResp = await handler.createProject({ orgId, templateId: tResp.template.id, name: "Scoped Project", ownerId }, makeAuthContext(ownerId));

    // A user with a grant at this project's scope specifically - and no
    // organization_members row for `orgId` at all.
    const scopedUserId = "user-t10-scoped";
    await db.insert(schemaSqlite.users).values({ id: scopedUserId, email: `${scopedUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.grants).values({
      id: "grant-t10-1", subjectType: "user", subjectId: scopedUserId,
      scopeType: "project", scopeId: pResp.project.id, roleId: "role-admin", createdAt: new Date(),
    });
    const scopedCtx = makeAuthContext(scopedUserId);

    const fetched = await handler.getProject({ id: pResp.project.id }, scopedCtx);
    expect(fetched.project.id).toBe(pResp.project.id);

    const updated = await handler.updateProject({ projectId: pResp.project.id, name: "Renamed by scoped grant" }, scopedCtx);
    expect(updated.project.name).toBe("Renamed by scoped grant");

    await handler.archiveProject({ projectId: pResp.project.id }, scopedCtx);
    await handler.restoreProject({ projectId: pResp.project.id }, scopedCtx);
    await handler.archiveProject({ projectId: pResp.project.id }, scopedCtx);
    await handler.purgeProject({ projectId: pResp.project.id }, scopedCtx);

    const afterPurge = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, pResp.project.id));
    expect(afterPurge.length).toBe(0);
  });

  test("a project-scoped grant does not reach a sibling project under the same org (exit criterion 6)", async () => {
    const { db } = await setupIntegrationTest();
    const handler = createProjectsHandler(db, null);
    const ptHandler2 = createProjectTemplatesHandler(db, null);

    const orgId = "org-t10-sibling";
    const ownerId = "user-t10-sibling-owner";
    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "T10 Sibling Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: ownerId, email: `${ownerId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: ownerId, role: "admin", joinedAt: new Date() });
    const tResp = await ptHandler2.createTemplate({ orgId, name: "Sibling Template" }, makeAuthContext(ownerId));
    const projectA = await handler.createProject({ orgId, templateId: tResp.template.id, name: "Project A", ownerId }, makeAuthContext(ownerId));
    const projectB = await handler.createProject({ orgId, templateId: tResp.template.id, name: "Project B", ownerId }, makeAuthContext(ownerId));

    const scopedUserId = "user-t10-sibling-scoped";
    await db.insert(schemaSqlite.users).values({ id: scopedUserId, email: `${scopedUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.grants).values({
      id: "grant-t10-2", subjectType: "user", subjectId: scopedUserId,
      scopeType: "project", scopeId: projectA.project.id, roleId: "role-admin", createdAt: new Date(),
    });
    const scopedCtx = makeAuthContext(scopedUserId);

    await expect(handler.getProject({ id: projectA.project.id }, scopedCtx)).resolves.toBeDefined();
    await expect(handler.getProject({ id: projectB.project.id }, scopedCtx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(handler.updateProject({ projectId: projectB.project.id, name: "Should not work" }, scopedCtx))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });
});
