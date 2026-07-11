import { expect, test, describe, beforeAll } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createProjectsHandler, createProjectTemplatesHandler } from "./projects.handler";

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

  test("rejects access from a user who isn't a member of the org", async () => {
     const outsiderCtx = makeAuthContext("user-outsider");
     await db.insert(schemaSqlite.users).values({ id: "user-outsider", email: "outsider@example.com", createdAt: new Date() });

     await expect(pHandler.listProjects({ orgId: "org-test" }, outsiderCtx)).rejects.toThrow();
     await expect(pHandler.createProject({ orgId: "org-test", templateId: "t-1", name: "X", ownerId: "user-outsider" }, outsiderCtx)).rejects.toThrow();
     await expect(pHandler.listProjects({}, makeAuthContext(null))).rejects.toThrow();
  });
});
