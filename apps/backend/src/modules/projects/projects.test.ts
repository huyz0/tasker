import { expect, test, describe, beforeAll } from "bun:test";
import { setupIntegrationTest } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createProjectsHandler, createProjectTemplatesHandler } from "./projects.handler";

describe("Projects Handler Integration Logic", () => {
  let db: any;
  let mockNc: any;
  let pHandler: any;
  let ptHandler: any;

  beforeAll(async () => {
     const setup = await setupIntegrationTest();
     db = setup.db;
     mockNc = setup.nc;
     pHandler = createProjectsHandler(db, mockNc);
     ptHandler = createProjectTemplatesHandler(db, mockNc);
     
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
     } catch (e) {
        // May already exist
     }
  });

  test("can insert a template and then a project via handlers", async () => {
     const tResp = await ptHandler.createTemplate({
         orgId: "org-test",
         name: "Test Template",
         description: "A test pt"
     });
     
     expect(tResp.template.id).toBeDefined();
     expect(tResp.template.name).toBe("Test Template");

     const pResp = await pHandler.createProject({
         orgId: "org-test",
         templateId: tResp.template.id,
         name: "Test Project",
         ownerId: "user-test"
     });

     expect(pResp.project.id).toBeDefined();
     expect(pResp.project.name).toBe("Test Project");
     expect(mockNc.publishedMessages.map((m: any) => m.subject)).toContain("domain.project.created");

     // Fetch project
     const fetchProj = await pHandler.getProject({ id: pResp.project.id });
     expect(fetchProj.project.name).toBe("Test Project");

     // Fetch template
     const fetchTpl = await ptHandler.getTemplate({ id: tResp.template.id });
     expect(fetchTpl.template.name).toBe("Test Template");

     // Test 404 throws
     expect(pHandler.getProject({ id: "invalid-id" })).rejects.toThrow("not found");
     expect(ptHandler.getTemplate({ id: "invalid-id" })).rejects.toThrow("not found");
  });
});
