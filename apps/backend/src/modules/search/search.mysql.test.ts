import { describe, it, expect } from "bun:test";
import { setupDatabase } from "../../db/db";
import * as schemaMysql from "../../db/schema.mysql";
import { makeAuthContext } from "../../test/setup";
import createSearchHandler from "./search.handler";

// Requires a real MySQL instance reachable via DB_HOST/DB_USER/DB_PASSWORD/DB_NAME
// (`docker compose up -d mysql` from the repo root) - not run by default
// `bun test`, matching `tasks.mysql.test.ts`, since CI has no MySQL service.
//
// This is M07-T07's verify line: the clustered dialect returns the same
// *ranking* as standalone. "Same ranking" means the same resulting order, not
// the same scores - SQLite's bm25() is a negative value that falls as a match
// improves, MySQL's relevance is a positive one that rises, and the ORDER BY
// directions differ to match. A test asserting only that both dialects find the
// row would pass with the sort inverted, which is precisely the mistake worth
// guarding against here.
const runMysqlIntegration = process.env.TASKER_MYSQL_INTEGRATION === "1";
const testIf = runMysqlIntegration ? describe : describe.skip;

function captureServiceImpl(db: any) {
  let impl: any;
  const fakeRouter = {
    service: (_desc: any, serviceImpl: any) => {
      impl = serviceImpl;
      return fakeRouter;
    },
  };
  createSearchHandler(fakeRouter as any, db);
  return impl;
}

testIf("universalSearch (mysql FULLTEXT)", () => {
  it("ranks by relevance rather than creation date, as the SQLite branch does", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const db = (await setupDatabase("mysql")) as any;
      const impl = captureServiceImpl(db);

      const orgId = "org-" + crypto.randomUUID();
      const userId = "user-" + crypto.randomUUID();
      const templateId = "tmpl-" + crypto.randomUUID();
      const projectId = "proj-" + crypto.randomUUID();

      await db.insert(schemaMysql.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now() });
      await db.insert(schemaMysql.users).values({ id: userId, email: `${userId}@test.com` });
      await db.insert(schemaMysql.organizationMembers).values({ orgId, userId, role: "admin" });
      await db.insert(schemaMysql.projectTemplates).values({ id: templateId, orgId, name: "Tmpl" });
      await db.insert(schemaMysql.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key: "SRCH" });

      // Same fixture as the SQLite test: the STRONG match is the OLDER row, so
      // a pass cannot be explained by creation-date ordering.
      const strongId = "tsk-strong-" + crypto.randomUUID();
      const weakId = "tsk-weak-" + crypto.randomUUID();
      await db.insert(schemaMysql.tasks).values({
        id: strongId, projectId, title: "Rankable rankable", status: "todo",
        createdAt: new Date("2020-01-01"),
      });
      await db.insert(schemaMysql.tasks).values({
        id: weakId, projectId, title: "Unrelated heading", status: "todo",
        description: "a long body ".repeat(20) + " rankable " + "and more filler ".repeat(20),
        createdAt: new Date("2030-01-01"),
      });

      const res: any = await impl.universalSearch({ query: "rankable", orgId }, makeAuthContext(userId));
      const ids = res.results.map((r: any) => r.id);

      expect(ids).toContain(strongId);
      expect(ids).toContain(weakId);
      expect(ids.indexOf(strongId)).toBeLessThan(ids.indexOf(weakId));
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });

  it("matches whole words, so 'cat' does not find 'concatenate'", async () => {
    const previousStandalone = process.env.STANDALONE;
    process.env.STANDALONE = "false";
    try {
      const db = (await setupDatabase("mysql")) as any;
      const impl = captureServiceImpl(db);

      const orgId = "org-" + crypto.randomUUID();
      const userId = "user-" + crypto.randomUUID();
      const templateId = "tmpl-" + crypto.randomUUID();
      const projectId = "proj-" + crypto.randomUUID();

      await db.insert(schemaMysql.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now() });
      await db.insert(schemaMysql.users).values({ id: userId, email: `${userId}@test.com` });
      await db.insert(schemaMysql.organizationMembers).values({ orgId, userId, role: "admin" });
      await db.insert(schemaMysql.projectTemplates).values({ id: templateId, orgId, name: "Tmpl" });
      await db.insert(schemaMysql.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key: "SRCH2" });
      await db.insert(schemaMysql.tasks).values({
        id: "tsk-concat-" + crypto.randomUUID(), projectId,
        title: "concatenate the buffers", status: "todo", createdAt: new Date(),
      });

      const res: any = await impl.universalSearch({ query: "cat", orgId }, makeAuthContext(userId));
      expect(res.results.map((r: any) => r.title)).not.toContain("concatenate the buffers");
    } finally {
      process.env.STANDALONE = previousStandalone;
    }
  });
});
