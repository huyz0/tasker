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

/** A fresh org/project against the real server, plus a handler bound to it. */
async function withMysqlFixture(key: string) {
  const db = (await setupDatabase("mysql")) as any;
  const impl = captureServiceImpl(db);

  const orgId = "org-" + crypto.randomUUID();
  const userId = "user-" + crypto.randomUUID();
  const templateId = "tmpl-" + crypto.randomUUID();
  const projectId = "proj-" + crypto.randomUUID();
  const folderId = "fld-" + crypto.randomUUID();

  await db.insert(schemaMysql.organizations).values({ id: orgId, name: "Org", slug: "org-" + crypto.randomUUID() });
  await db.insert(schemaMysql.users).values({ id: userId, email: `${userId}@test.com` });
  await db.insert(schemaMysql.organizationMembers).values({ orgId, userId, role: "admin" });
  await db.insert(schemaMysql.projectTemplates).values({ id: templateId, orgId, name: "Tmpl" });
  await db.insert(schemaMysql.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", key });
  await db.insert(schemaMysql.folders).values({ id: folderId, projectId, name: "Folder" });

  return { db, impl, orgId, projectId, folderId, ctx: makeAuthContext(userId) };
}

/** The MySQL branch is only selected when STANDALONE is not "true". */
async function asClustered<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.STANDALONE;
  process.env.STANDALONE = "false";
  try {
    return await run();
  } finally {
    process.env.STANDALONE = previous;
  }
}

testIf("universalSearch (mysql FULLTEXT)", () => {
  it("ranks by relevance rather than creation date, as the SQLite branch does", async () => {
    await asClustered(async () => {
      const { db, impl, orgId, projectId, ctx } = await withMysqlFixture("SRCH");

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

      const res: any = await impl.universalSearch({ query: "rankable", orgId }, ctx);
      const ids = res.results.map((r: any) => r.id);

      expect(ids).toContain(strongId);
      expect(ids).toContain(weakId);
      expect(ids.indexOf(strongId)).toBeLessThan(ids.indexOf(weakId));
    });
  });

  it("matches whole words, so 'cat' does not find 'concatenate'", async () => {
    await asClustered(async () => {
      const { db, impl, orgId, projectId, ctx } = await withMysqlFixture("SRCH2");
      await db.insert(schemaMysql.tasks).values({
        id: "tsk-concat-" + crypto.randomUUID(), projectId,
        title: "concatenate the buffers", status: "todo", createdAt: new Date(),
      });

      const res: any = await impl.universalSearch({ query: "cat", orgId }, ctx);
      expect(res.results.map((r: any) => r.title)).not.toContain("concatenate the buffers");
    });
  });

  it("pages with a non-zero OFFSET without repeating a row", async () => {
    // mysql2 sends `execute` as a prepared statement, and MySQL has
    // historically refused placeholders in LIMIT/OFFSET. The first page alone
    // would not prove OFFSET binds, since page one is always OFFSET 0.
    await asClustered(async () => {
      const { db, impl, orgId, projectId, ctx } = await withMysqlFixture("SRCH3");
      await db.insert(schemaMysql.tasks).values(
        Array.from({ length: 7 }, (_, i) => ({
          id: `tsk-paged-${i}-` + crypto.randomUUID(), projectId,
          title: `Paginatable item ${i}`, status: "todo", createdAt: new Date(),
        })),
      );

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 20; guard++) {
        const res: any = await impl.universalSearch({ query: "Paginatable", orgId, page: { limit: 2, cursor } }, ctx);
        seen.push(...res.results.map((r: any) => r.id));
        cursor = res.page.nextCursor;
        if (!cursor) break;
      }

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBe(7);
    });
  });

  it("finds an agent, a project and a comment, the types M07-T08 added", async () => {
    // These three entities are separate SQL in each dialect, so passing on
    // SQLite says nothing about MySQL. The agent case is M07-T08's verify line.
    await asClustered(async () => {
      const { db, impl, orgId, projectId, ctx } = await withMysqlFixture("SRCH5");

      const roleId = "role-" + crypto.randomUUID();
      const agentId = "agt-" + crypto.randomUUID();
      await db.insert(schemaMysql.agentRoles).values({ id: roleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]" });
      await db.insert(schemaMysql.agents).values({ id: agentId, orgId, agentRoleId: roleId, name: "Cartographer" });

      const taskId = "tsk-host-" + crypto.randomUUID();
      await db.insert(schemaMysql.tasks).values({ id: taskId, projectId, title: "Host task", status: "todo", createdAt: new Date() });
      await db.insert(schemaMysql.comments).values({
        id: "cmt-" + crypto.randomUUID(), entityId: taskId, entityType: "task",
        content: "the pelican migration needs a second pass",
      });

      const agentHit: any = await impl.universalSearch({ query: "Cartographer", orgId }, ctx);
      expect(agentHit.results.find((r: any) => r.type === "agent")?.id).toBe(agentId);

      // The fixture project is named "Proj".
      const projectHit: any = await impl.universalSearch({ query: "Proj", orgId }, ctx);
      expect(projectHit.results.find((r: any) => r.type === "project")?.id).toBe(projectId);

      const commentHit: any = await impl.universalSearch({ query: "pelican", orgId }, ctx);
      const comment = commentHit.results.find((r: any) => r.type === "comment");
      expect(comment).toBeDefined();
      expect(comment.parentType).toBe("task");
      expect(comment.parentId).toBe(taskId);
    });
  });

  it("does not index words shorter than innodb_ft_min_token_size, unlike SQLite", async () => {
    // A real, measured divergence between the dialects rather than a bug:
    // `innodb_ft_min_token_size` defaults to 3, so a two-character term matches
    // nothing here while SQLite's unicode61 tokenizer, which has no such floor,
    // finds it. Asserted so the difference is documented and discovered by a
    // test rather than by a user; changing it means changing server config,
    // which is a deployment decision.
    await asClustered(async () => {
      const { db, impl, orgId, projectId, ctx } = await withMysqlFixture("SRCH4");
      await db.insert(schemaMysql.tasks).values({
        id: "tsk-short-" + crypto.randomUUID(), projectId,
        title: "go somewhere", status: "todo", createdAt: new Date(),
      });

      const short: any = await impl.universalSearch({ query: "go", orgId }, ctx);
      expect(short.results.map((r: any) => r.title)).not.toContain("go somewhere");

      // The same row is found by a word at or over the floor, proving the miss
      // is the token size and not a broken fixture.
      const long: any = await impl.universalSearch({ query: "somewhere", orgId }, ctx);
      expect(long.results.map((r: any) => r.title)).toContain("go somewhere");
    });
  });
});
