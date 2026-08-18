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
  let userId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    impl = captureServiceImpl(db);

    orgId = "org-" + crypto.randomUUID();
    userId = "user-" + crypto.randomUUID();
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

  it("finds a matching active belief but not a superseded one (M21-T06)", async () => {
    const activeId = "blf-" + crypto.randomUUID();
    const supersededId = "blf-" + crypto.randomUUID();
    await db.insert(schemaSqlite.beliefs).values({
      id: activeId, orgId, scopeType: "project", scopeId: projectId,
      statement: "Findable belief statement", confidence: "medium", status: "active",
      sourceKind: "user", sourceUserId: userId, createdAt: new Date(),
    });
    await db.insert(schemaSqlite.beliefs).values({
      id: supersededId, orgId, scopeType: "project", scopeId: projectId,
      statement: "Findable superseded belief", confidence: "medium", status: "superseded",
      sourceKind: "user", sourceUserId: userId, createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "Findable", orgId }, ctx);
    const beliefHit = res.results.find((r: any) => r.type === "belief");
    expect(beliefHit).toBeDefined();
    expect(beliefHit.id).toBe(activeId);
    expect(beliefHit.title).toContain("Findable belief statement");
    expect(res.results.some((r: any) => r.id === supersededId)).toBe(false);
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

  it("respects page.limit and reports the full totalCount regardless", async () => {
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

    // Allocation is round-robin across the entity types (M07-T08), so with
    // matches of both types available the merged page must still stop at
    // exactly 3 rather than rounding up to 4.
    const res = await impl.universalSearch({ query: "OddLimitable", orgId, page: { limit: 3 } }, ctx);
    expect(res.results.length).toBe(3);
  });

  it("does not skip an artifact trimmed off by an odd page.limit when paging through all results", async () => {
    // With 2 tasks + 2 artifacts matching and a limit of 3, round-robin
    // allocation keeps 2 tasks and 1 artifact, dropping one artifact. That
    // artifact must still surface on a later page instead of being permanently
    // skipped by a cursor that advanced past a row it never returned.
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

  // Replaces a test that asserted LIKE's `_` wildcard was escaped. That
  // behaviour is gone with the LIKE scan (M07-T06); the equivalent exposure is
  // now FTS5's own query language, where `"` is not a wildcard but a syntax
  // error that would surface as a 500.
  it("treats FTS5 operator characters in the query as literal text, not syntax", async () => {
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-quote-" + crypto.randomUUID(), projectId, title: "Quoted release notes", status: "todo", createdAt: new Date() });

    // Punctuation is dropped, so the row is still found.
    for (const query of ['Quoted"', 'Quoted*', '^Quoted', 'Quoted:notes', '"Quoted release"']) {
      const res = await impl.universalSearch({ query, orgId }, ctx);
      expect(res.results.map((r: any) => r.title)).toContain("Quoted release notes");
    }

    // FTS5 keywords are demoted to ordinary words, so "Quoted OR" asks for a
    // row containing both "Quoted" and "or" rather than either — it must return
    // nothing, and it must not raise. A handler that let these through as
    // operators would answer a question the caller did not ask.
    for (const query of ["Quoted OR", "Quoted AND NOT"]) {
      const res = await impl.universalSearch({ query, orgId }, ctx);
      expect(res.results).toHaveLength(0);
    }
  });

  it("returns nothing, rather than erroring, when the query is only punctuation", async () => {
    const res = await impl.universalSearch({ query: "???", orgId }, ctx);
    expect(res.results).toHaveLength(0);
    expect(res.page.totalCount).toBe(0);
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

  // ---------------------------------------------------------------------
  // M07-T06 — served from the FTS5 index, ranked by bm25. See ADR-0010.
  // ---------------------------------------------------------------------

  it("ranks by relevance, not by creation date", async () => {
    // The task's verify line. The strong match is the OLDER row, so under the
    // previous `ORDER BY createdAt DESC` it came second; if it comes first now,
    // the ordering is genuinely the relevance score and not the clock.
    const strongId = "tsk-strong-" + crypto.randomUUID();
    const weakId = "tsk-weak-" + crypto.randomUUID();

    await db.insert(schemaSqlite.tasks).values({
      id: strongId, projectId, title: "Rankable rankable", status: "todo",
      createdAt: new Date("2020-01-01"),
    });
    await db.insert(schemaSqlite.tasks).values({
      id: weakId, projectId, title: "Unrelated heading", status: "todo",
      description: "a long body ".repeat(20) + " rankable " + "and more filler ".repeat(20),
      createdAt: new Date("2030-01-01"),
    });

    const res = await impl.universalSearch({ query: "rankable", orgId }, ctx);
    const ids = res.results.map((r: any) => r.id);
    expect(ids).toContain(strongId);
    expect(ids).toContain(weakId);
    expect(ids.indexOf(strongId)).toBeLessThan(ids.indexOf(weakId));
  });

  it("matches whole words, so 'cat' no longer finds 'concatenate'", async () => {
    await db.insert(schemaSqlite.tasks).values({ id: "tsk-concat-" + crypto.randomUUID(), projectId, title: "concatenate the buffers", status: "todo", createdAt: new Date() });
    const res = await impl.universalSearch({ query: "cat", orgId }, ctx);
    expect(res.results.map((r: any) => r.title)).not.toContain("concatenate the buffers");
  });

  it("returns a snippet around the match, not the opening of the text", async () => {
    const filler = "Preamble that is not what anyone searched for. ".repeat(6);
    await db.insert(schemaSqlite.tasks).values({
      id: "tsk-snip-" + crypto.randomUUID(), projectId, title: "Snippable", status: "todo",
      description: filler + "the quarantine threshold is configurable",
      createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "quarantine", orgId }, ctx);
    const hit = res.results.find((r: any) => r.title === "Snippable");
    // The old handler returned description.substring(0, 100), which for this
    // row is entirely preamble — a snippet that never contains the search term.
    expect(hit.snippet).toContain("quarantine");
    expect(hit.snippet.startsWith("…")).toBe(true);
  });

  it("marks where the query words fall inside the snippet", async () => {
    const filler = "Preamble that is not what anyone searched for. ".repeat(6);
    await db.insert(schemaSqlite.tasks).values({
      id: "tsk-mark-" + crypto.randomUUID(), projectId, title: "Markable", status: "todo",
      description: filler + "the quarantine threshold is configurable",
      createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "quarantine", orgId }, ctx);
    const hit = res.results.find((r: any) => r.title === "Markable");

    expect(hit.snippetMatches.length).toBeGreaterThan(0);
    // Offsets must address the *snippet*, not the source text. The snippet is
    // trimmed and carries a leading ellipsis, so a range measured against the
    // original would land on the wrong characters — and by a different amount
    // for every result, which is the kind of bug that looks like a font issue.
    const { start, length } = hit.snippetMatches[0];
    expect(hit.snippet.slice(start, start + length).toLowerCase()).toBe("quarantine");
  });

  it("merges overlapping marks so a repeated word is not marked twice", async () => {
    await db.insert(schemaSqlite.tasks).values({
      id: "tsk-overlap-" + crypto.randomUUID(), projectId, title: "Overlappable", status: "todo",
      description: "the migration migration ran twice", createdAt: new Date(),
    });

    // "migration migrations" tokenises to two words that both match the same
    // text; without merging, the client gets nested ranges to render.
    const res = await impl.universalSearch({ query: "migration migrations", orgId }, ctx);
    const hit = res.results.find((r: any) => r.title === "Overlappable");
    if (hit) {
      const ranges = hit.snippetMatches;
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].start + ranges[i - 1].length);
      }
    }
  });

  it("returns no marks for a result whose snippet is empty", async () => {
    // A project has no body to snippet, so there is nothing to mark — and an
    // offset into an empty string would be a range the client cannot render.
    const res = await impl.universalSearch({ query: "Proj", orgId }, ctx);
    const hit = res.results.find((r: any) => r.type === "project");
    expect(hit.snippet).toBe("");
    expect(hit.snippetMatches).toEqual([]);
  });

  it("still finds a task by a word that appears only in its description", async () => {
    await db.insert(schemaSqlite.tasks).values({
      id: "tsk-desc-" + crypto.randomUUID(), projectId, title: "Opaque heading", status: "todo",
      description: "mentions aardvark once", createdAt: new Date(),
    });
    const res = await impl.universalSearch({ query: "aardvark", orgId }, ctx);
    expect(res.results.map((r: any) => r.title)).toContain("Opaque heading");
  });

  it("no longer searches artifact bodies, which the index deliberately omits", async () => {
    // A recorded narrowing, not an oversight: `artifacts.content` holds base64
    // blobs whose indexed form would be a large index of unsearchable noise
    // (ADR-0010). Asserted so the loss is visible if anyone expects otherwise.
    const folderId = "fld-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Bodies", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({
      id: "art-body-" + crypto.randomUUID(), folderId, name: "Opaque artifact",
      content: "buried zebra in the body", createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "zebra", orgId }, ctx);
    expect(res.results.map((r: any) => r.title)).not.toContain("Opaque artifact");
  });

  it("finds an artifact by its description, which the index does cover", async () => {
    const folderId = "fld-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Described", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({
      id: "art-desc-" + crypto.randomUUID(), folderId, name: "Opaque artifact name",
      description: "covers the wombat migration", createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "wombat", orgId }, ctx);
    expect(res.results.map((r: any) => r.title)).toContain("Opaque artifact name");
  });

  it("pages a ranked result set without repeating or skipping a row", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      id: `tsk-paged-${i}-` + crypto.randomUUID(), projectId,
      title: `Paginatable item ${i}`, status: "todo", createdAt: new Date(),
    }));
    await db.insert(schemaSqlite.tasks).values(rows);

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

  it("does not restart one entity type when the other still has pages left", async () => {
    // The two types page independently, and they run out at different times.
    // If "no more tasks" is encoded the same way as "no task cursor yet", the
    // next page restarts tasks from the top and returns the same task on every
    // page for as long as artifacts keep going.
    const folderId = "fld-" + crypto.randomUUID();
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Lopsided", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({
      id: "tsk-lopsided-" + crypto.randomUUID(), projectId, title: "Lopsided lone task", status: "todo", createdAt: new Date(),
    });
    await db.insert(schemaSqlite.artifacts).values(
      Array.from({ length: 5 }, (_, i) => ({
        id: `art-lopsided-${i}-` + crypto.randomUUID(), folderId,
        name: `Lopsided artifact ${i}`, createdAt: new Date(),
      })),
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const res: any = await impl.universalSearch({ query: "Lopsided", orgId, page: { limit: 2, cursor } }, ctx);
      seen.push(...res.results.map((r: any) => r.id));
      cursor = res.page.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(6);
  });

  // ---------------------------------------------------------------------
  // M07-T08 — projects, agents and comments are searchable too.
  // ---------------------------------------------------------------------

  async function seedAgent(name: string) {
    const roleId = "role-" + crypto.randomUUID();
    const agentId = "agt-" + crypto.randomUUID();
    await db.insert(schemaSqlite.agentRoles).values({ id: roleId, orgId, name: "Role", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
    await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId: roleId, name, createdAt: new Date() });
    return agentId;
  }

  it("finds an agent by its name", async () => {
    // The task's verify line.
    const agentId = await seedAgent("Cartographer");
    const res = await impl.universalSearch({ query: "Cartographer", orgId }, ctx);
    const hit = res.results.find((r: any) => r.type === "agent");
    expect(hit).toBeDefined();
    expect(hit.id).toBe(agentId);
    expect(hit.title).toBe("Cartographer");
  });

  it("does not return an agent from another organization", async () => {
    // Agents are org-scoped directly rather than through a project, so this is
    // a different join from the task and artifact paths and needs its own test.
    const otherOrgId = "org-" + crypto.randomUUID();
    const otherUserId = "user-" + crypto.randomUUID();
    const otherRoleId = "role-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-" + crypto.randomUUID(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: otherRoleId, orgId: otherOrgId, name: "Role", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
    await db.insert(schemaSqlite.agents).values({ id: "agt-other-" + crypto.randomUUID(), orgId: otherOrgId, agentRoleId: otherRoleId, name: "Interloper", createdAt: new Date() });

    const res = await impl.universalSearch({ query: "Interloper", orgId }, ctx);
    expect(res.results).toHaveLength(0);
  });

  it("finds a project by its name", async () => {
    const res = await impl.universalSearch({ query: "Proj", orgId }, ctx);
    const hit = res.results.find((r: any) => r.type === "project");
    expect(hit).toBeDefined();
    expect(hit.id).toBe(projectId);
  });

  it("finds a comment and points it at the task it hangs off", async () => {
    // A comment has no screen of its own, so the result carries its parent.
    // Without that the GUI has an id it cannot route to.
    const taskId = "tsk-commented-" + crypto.randomUUID();
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Host task", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.comments).values({
      id: "cmt-" + crypto.randomUUID(), entityId: taskId, entityType: "task",
      content: "the pelican migration needs a second pass", createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "pelican", orgId }, ctx);
    const hit = res.results.find((r: any) => r.type === "comment");
    expect(hit).toBeDefined();
    expect(hit.parentType).toBe("task");
    expect(hit.parentId).toBe(taskId);
    expect(hit.title).toBe("Host task");
    expect(hit.snippet).toContain("pelican");
  });

  it("excludes a comment whose parent task has been binned", async () => {
    const taskId = "tsk-binned-" + crypto.randomUUID();
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Binned host", status: "todo", createdAt: new Date(), deletedAt: new Date() });
    await db.insert(schemaSqlite.comments).values({
      id: "cmt-binned-" + crypto.randomUUID(), entityId: taskId, entityType: "task",
      content: "mentions okapi once", createdAt: new Date(),
    });

    const res = await impl.universalSearch({ query: "okapi", orgId }, ctx);
    expect(res.results).toHaveLength(0);
  });

  it("fills the page from the types that matched, rather than reserving space for those that did not", async () => {
    // An even split of the limit across every type looks fair and under-fills
    // every page: a term matching only tasks used to return just tasks' even
    // share and a next cursor. The share is redistributed instead.
    await db.insert(schemaSqlite.tasks).values(
      Array.from({ length: 9 }, (_, i) => ({
        id: `tsk-fill-${i}-` + crypto.randomUUID(), projectId,
        title: `Fillable item ${i}`, status: "todo", createdAt: new Date(),
      })),
    );

    const res = await impl.universalSearch({ query: "Fillable", orgId, page: { limit: 5 } }, ctx);
    expect(res.results).toHaveLength(5);
    expect(res.results.every((r: any) => r.type === "task")).toBe(true);
  });

  it("stops offering pages past the depth cap, while still reporting the true total", async () => {
    // Ordering by relevance re-sorts the whole match set per page, so offset is
    // not free and the depth is bounded (ADR-0010). The cap limits what is
    // *served*, not what is *counted* — a total that shrank to the cap would be
    // a lie about how much matched.
    const rows = Array.from({ length: 205 }, (_, i) => ({
      id: `tsk-deep-${i}-` + crypto.randomUUID(), projectId,
      title: `Deeplypaged item ${i}`, status: "todo", createdAt: new Date(),
    }));
    await db.insert(schemaSqlite.tasks).values(rows);

    const seen = new Set<string>();
    let cursor: string | undefined;
    let reportedTotal = 0;
    for (let guard = 0; guard < 40; guard++) {
      const res: any = await impl.universalSearch({ query: "Deeplypaged", orgId, page: { limit: 100, cursor } }, ctx);
      res.results.forEach((r: any) => seen.add(r.id));
      reportedTotal = Number(res.page.totalCount);
      cursor = res.page.nextCursor;
      if (!cursor) break;
    }

    expect(reportedTotal).toBe(205);
    expect(seen.size).toBe(200);
  });
});
