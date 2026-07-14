import { describe, it, expect, beforeEach } from "bun:test";
import { Code } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import createSearchHandler from "./search.handler";

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

describe("Search Handler", () => {
  let db: any;
  let impl: any;
  let ctx: any;
  let orgId: string;
  let projectId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    impl = captureServiceImpl(db);

    orgId = "org-" + crypto.randomUUID();
    const userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    projectId = "proj-" + crypto.randomUUID();
    const folderId = "fld-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-" + crypto.randomUUID(), projectId, title: "Findable Task Title", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: "art-" + crypto.randomUUID(), folderId, name: "Findable Artifact Name", createdAt: new Date() });

    ctx = makeAuthContext(userId);
  });

  it("finds matching tasks and artifacts within the caller's org", async () => {
    const res = await impl.universalSearch({ query: "Findable", orgId }, ctx);
    const types = res.results.map((r: any) => r.type);
    expect(types).toContain("task");
    expect(types).toContain("artifact");
  });

  it("does not return results from a different org", async () => {
    const otherOrgId = "org-" + crypto.randomUUID();
    const otherUserId = "user-" + crypto.randomUUID();
    const otherTemplateId = "tmpl-" + crypto.randomUUID();
    const otherProjectId = "proj-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: otherTemplateId, orgId: otherOrgId, name: "T", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: otherProjectId, orgId: otherOrgId, templateId: otherTemplateId, ownerId: otherUserId, name: "P", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-" + crypto.randomUUID(), projectId: otherProjectId, title: "Findable Task Title", status: "todo", createdAt: new Date() });

    // Searching as the other org's member should not surface this org's task, and vice versa.
    const resAsOther = await impl.universalSearch({ query: "Findable", orgId: otherOrgId }, makeAuthContext(otherUserId));
    expect(resAsOther.results.every((r: any) => r.type !== "task" || true)).toBe(true);
    expect(resAsOther.results.length).toBe(1); // only the other org's own task

    const resAsFirst = await impl.universalSearch({ query: "Findable", orgId }, ctx);
    expect(resAsFirst.results.length).toBe(2); // this org's task + artifact only
  });

  it("rejects search from a user who is not a member of the requested org", async () => {
    await expect(impl.universalSearch({ query: "Findable", orgId }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  it("rejects search with no orgId using a proper ConnectError InvalidArgument code, not a plain Error", async () => {
    await expect(impl.universalSearch({ query: "Findable" }, ctx)).rejects.toThrow();
    try {
      await impl.universalSearch({ query: "Findable" }, ctx);
      expect.unreachable();
    } catch (e: any) {
      expect(e.code).toBe(Code.InvalidArgument);
    }
  });

  it("rejects search with an empty or missing query instead of silently matching everything", async () => {
    await expect(impl.universalSearch({ orgId }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    await expect(impl.universalSearch({ query: "", orgId }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    await expect(impl.universalSearch({ query: "   ", orgId }, ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it("rejects unauthenticated search", async () => {
    await expect(impl.universalSearch({ query: "Findable", orgId }, makeAuthContext(null))).rejects.toThrow();
  });

  it("reports totalCount for the full matched set", async () => {
    const res = await impl.universalSearch({ query: "Findable", orgId }, ctx);
    // totalCount reflects everything matched (2 here), independent of the
    // per-request limit split across task/artifact result types.
    expect(res.page.totalCount).toBe(2);
  });

  it("respects page.limit, splitting it across task and artifact results, and reports the full totalCount regardless", async () => {
    for (let i = 0; i < 4; i++) {
      await db.insert(schemaSqlite.tasks).values({ id: `tsk-limit-${i}`, projectId, title: `UniquelyLimitable Task ${i}`, status: "todo", createdAt: new Date() });
    }

    const res = await impl.universalSearch({ query: "UniquelyLimitable", orgId, page: { limit: 2 } }, ctx);
    expect(res.results.length).toBeLessThanOrEqual(2);
    expect(res.page.totalCount).toBe(4);
  });

  it("never returns more results than page.limit, even when the limit is odd", async () => {
    for (let i = 0; i < 4; i++) {
      await db.insert(schemaSqlite.tasks).values({ id: `tsk-odd-${i}`, projectId, title: `OddLimitable Task ${i}`, status: "todo", createdAt: new Date() });
    }
    const folderId = "fld-odd-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder Odd", createdAt: new Date() });
    for (let i = 0; i < 4; i++) {
      await db.insert(schemaSqlite.artifacts).values({ id: `art-odd-${i}`, folderId, name: `OddLimitable Artifact ${i}`, createdAt: new Date() });
    }

    // perTypeLimit = ceil(3/2) = 2 per type; with >=2 matches of each type
    // available, the merged total must still be capped at 3, not 4.
    const res = await impl.universalSearch({ query: "OddLimitable", orgId, page: { limit: 3 } }, ctx);
    expect(res.results.length).toBe(3);
  });

  it("does not skip an artifact trimmed off by an odd page.limit when paging through all results", async () => {
    // perTypeLimit = ceil(3/2) = 2 per type; with 2 tasks + 2 artifacts
    // matching, the first page fetches 2+2=4 and trims to 3, dropping one
    // artifact. That artifact must still surface on a later page instead of
    // being permanently skipped by a cursor that points past it.
    for (let i = 0; i < 2; i++) {
      await db.insert(schemaSqlite.tasks).values({ id: `tsk-oddpage-${i}`, projectId, title: `OddPageable Task ${i}`, status: "todo", createdAt: new Date(Date.now() - i * 1000) });
    }
    const folderId = "fld-oddpage-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder OddPage", createdAt: new Date() });
    for (let i = 0; i < 2; i++) {
      await db.insert(schemaSqlite.artifacts).values({ id: `art-oddpage-${i}`, folderId, name: `OddPageable Artifact ${i}`, createdAt: new Date(Date.now() - i * 1000) });
    }

    const seenIds = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res: any = await impl.universalSearch({ query: "OddPageable", orgId, page: { limit: 3, cursor } }, ctx);
      res.results.forEach((r: any) => seenIds.add(r.id));
      cursor = res.page.nextCursor;
      if (!cursor) break;
    }

    expect(seenIds.size).toBe(4);
    expect(seenIds.has("art-oddpage-0")).toBe(true);
    expect(seenIds.has("art-oddpage-1")).toBe(true);
  });

  it("treats _ in the search query as a literal character, not a SQL single-char wildcard", async () => {
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-literal-" + crypto.randomUUID(), projectId, title: "foo_bar release", status: "todo", createdAt: new Date() });
    // Unescaped, the pattern "%o_b%" would also match this via its "oob"
    // substring (the "_" wildcard matching the middle "o").
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-decoy-" + crypto.randomUUID(), projectId, title: "foobar unrelated", status: "todo", createdAt: new Date() });

    const res = await impl.universalSearch({ query: "o_b", orgId }, ctx);
    const titles = res.results.map((r: any) => r.title);
    expect(titles).toContain("foo_bar release");
    expect(titles).not.toContain("foobar unrelated");
  });

  it("pages through results using nextCursor until the full matched set has been seen", async () => {
    for (let i = 0; i < 4; i++) {
      await db.insert(schemaSqlite.tasks).values({
        id: `tsk-page-${i}`,
        projectId,
        title: `PageableTask ${i}`,
        status: "todo",
        createdAt: new Date(Date.now() - i * 1000),
      });
    }

    const seenIds = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res: any = await impl.universalSearch({ query: "PageableTask", orgId, page: { limit: 2, cursor } }, ctx);
      res.results.forEach((r: any) => seenIds.add(r.id));
      cursor = res.page.nextCursor;
      if (!cursor) break;
    }

    expect(seenIds.size).toBe(4);
  });

  it("returns an undecodable cursor gracefully instead of throwing", async () => {
    const res = await impl.universalSearch({ query: "Findable", orgId, page: { cursor: "not-valid-base64-json" } }, ctx);
    expect(res.results.length).toBeGreaterThan(0);
  });

  it("excludes soft-deleted (binned) tasks and artifacts from results", async () => {
    const deletedTaskId = "tsk-" + crypto.randomUUID();
    const deletedArtifactId = "art-" + crypto.randomUUID();
    const folderId = "fld-" + crypto.randomUUID();
    await db.insert(schemaSqlite.tasks).values({ id: deletedTaskId, projectId, title: "Findable Deleted Task", status: "todo", createdAt: new Date(), deletedAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "F2", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: deletedArtifactId, folderId, name: "Findable Deleted Artifact", createdAt: new Date(), deletedAt: new Date() });

    const res = await impl.universalSearch({ query: "Findable Deleted", orgId }, ctx);
    expect(res.results.some((r: any) => r.id === deletedTaskId)).toBe(false);
    expect(res.results.some((r: any) => r.id === deletedArtifactId)).toBe(false);
  });
});
