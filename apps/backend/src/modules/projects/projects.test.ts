import { expect, test, describe, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createProjectsHandler, createProjectTemplatesHandler } from "./projects.handler";
import { createTasksHandler } from "../tasks/tasks.handler";

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

     const pResp = await pHandler.createProject({
         orgId: "org-test",
         templateId: tResp.template.id,
         name: "Test Project",
         ownerId: "user-test"
     }, ctx);

     expect(pResp.project.id).toBeDefined();
     expect(pResp.project.name).toBe("Test Project");
     expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.created");

     // Fetch project
     const fetchProj = await pHandler.getProject({ id: pResp.project.id }, ctx);
     expect(fetchProj.project.name).toBe("Test Project");

     // Fetch template
     const fetchTpl = await ptHandler.getTemplate({ id: tResp.template.id }, ctx);
     expect(fetchTpl.template.name).toBe("Test Template");

     // Test 404 throws
     expect(pHandler.getProject({ id: "invalid-id" }, ctx)).rejects.toThrow();
     expect(ptHandler.getTemplate({ id: "invalid-id" }, ctx)).rejects.toThrow();

     // Test listProjects
     const listRes = await pHandler.listProjects({ orgId: "org-test" }, ctx);
     expect(listRes.projects.length).toBeGreaterThan(0);
     expect(listRes.projects.some((p: any) => p.name === "Test Project")).toBe(true);

     expect(pHandler.listProjects({}, ctx)).rejects.toThrow();
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
     }, ctx)).rejects.toThrow();
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
});
