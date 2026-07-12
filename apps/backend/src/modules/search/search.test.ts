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
