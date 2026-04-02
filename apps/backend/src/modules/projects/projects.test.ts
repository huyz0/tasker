import { expect, test, describe, beforeAll } from "bun:test";
import { setupDatabase } from "../../db/db";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq } from "drizzle-orm";

describe("Projects Service End-to-End Logic", () => {
  let db: any;
  beforeAll(async () => {
     process.env.STANDALONE = "true";
     db = await setupDatabase("sqlite");
     
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

  test("can insert a template and then a project", async () => {
     const templateId = "pt-test-" + Date.now();
     await db.insert(schemaSqlite.projectTemplates).values({
        id: templateId,
        orgId: "org-test",
        name: "Test Template",
        createdAt: new Date()
     });

     const res = await db.select().from(schemaSqlite.projectTemplates).where(eq(schemaSqlite.projectTemplates.id, templateId));
     expect(res.length).toBe(1);
     expect(res[0].name).toBe("Test Template");

     const projectId = "p-test-" + Date.now();
     await db.insert(schemaSqlite.projects).values({
        id: projectId,
        orgId: "org-test",
        templateId: templateId,
        name: "Test Project",
        ownerId: "user-test",
        createdAt: new Date()
     });

     const projRes = await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId));
     expect(projRes.length).toBe(1);
     expect(projRes[0].name).toBe("Test Project");
  });
});
