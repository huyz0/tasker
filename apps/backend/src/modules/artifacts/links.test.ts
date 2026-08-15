import { describe, it, expect } from "bun:test";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createArtifactsHandler } from "./artifacts.handler";

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, member = `u-${s}`;
  const templateId = `t-${s}`, projectId = `p-${s}`, folderId = `f-${s}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: now });
  await db.insert(schema.users).values({ id: member, email: `${member}@t.test`, name: "Ada", createdAt: now });
  await db.insert(schema.organizationMembers).values({ orgId, userId: member, role: "admin", joinedAt: now });
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: member, name: "P", key: "LK", createdAt: now });
  await db.insert(schema.folders).values({ id: folderId, projectId, parentId: null, name: "F", createdAt: now });

  const task = async (id: string, title: string) => {
    await db.insert(schema.tasks).values({ id, projectId, title, status: "todo", createdAt: now });
    return id;
  };
  const artifact = async (id: string, name: string, content = "") => {
    await db.insert(schema.artifacts).values({ id, folderId, name, description: "", content, contentType: "text/markdown", createdAt: now });
    return id;
  };
  return { orgId, member, projectId, folderId, task, artifact };
}

const handlerFor = (db: any) => createArtifactsHandler(db, null);

describe("task ↔ artifact links", () => {
  it("lists an artifact on the task it was linked to, by name", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-1", "Write the guide");
    const artifactId = await artifact("art-1", "guide.md");
    const h = handlerFor(db);
    await h.linkTaskArtifact({ taskId, artifactId }, makeAuthContext(member));

    const res: any = await h.listTaskArtifactLinks({ taskId }, makeAuthContext(member));

    expect(res.links).toHaveLength(1);
    // The name is what the task detail renders; without it a client must fetch
    // artifacts - whose rows carry up to ~15MB of content - to show a title.
    expect(res.links[0]).toEqual(expect.objectContaining({
      taskId, artifactId, artifactName: "guide.md", taskTitle: "Write the guide",
    }));
  });

  it("reads the same relation from the artifact's end", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const artifactId = await artifact("art-2", "shared.md");
    const h = handlerFor(db);
    await h.linkTaskArtifact({ taskId: await task("tsk-a", "First"), artifactId }, makeAuthContext(member));
    await h.linkTaskArtifact({ taskId: await task("tsk-b", "Second"), artifactId }, makeAuthContext(member));

    const res: any = await h.listTaskArtifactLinks({ artifactId }, makeAuthContext(member));

    expect(res.links.map((l: any) => l.taskTitle).sort()).toEqual(["First", "Second"]);
  });

  it("refuses a request that names both ends, or neither", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-3", "T");
    const artifactId = await artifact("art-3", "a.md");
    const h = handlerFor(db);

    // Both set is ambiguous: it reads as "the link between these two", which is
    // a different query returning at most one row.
    await expect(h.listTaskArtifactLinks({ taskId, artifactId }, makeAuthContext(member))).rejects.toThrow();
    await expect(h.listTaskArtifactLinks({}, makeAuthContext(member))).rejects.toThrow();
    // Proto3 sends "" rather than omitting a string, so empty must count as unset.
    await expect(h.listTaskArtifactLinks({ taskId: "", artifactId: "" }, makeAuthContext(member))).rejects.toThrow();
  });

  it("treats linking the same pair twice as one link", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-4", "T");
    const artifactId = await artifact("art-4", "a.md");
    const h = handlerFor(db);

    const first: any = await h.linkTaskArtifact({ taskId, artifactId }, makeAuthContext(member));
    const second: any = await h.linkTaskArtifact({ taskId, artifactId }, makeAuthContext(member));

    // Two rows would show the artifact twice on the task, and the second ✕
    // would appear to do nothing.
    expect(second.link.id).toBe(first.link.id);
    expect(((await h.listTaskArtifactLinks({ taskId }, makeAuthContext(member))) as any).links).toHaveLength(1);
  });

  it("unlinks the named pair only", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-5", "T");
    const keep = await artifact("art-keep", "keep.md");
    const drop = await artifact("art-drop", "drop.md");
    const h = handlerFor(db);
    await h.linkTaskArtifact({ taskId, artifactId: keep }, makeAuthContext(member));
    await h.linkTaskArtifact({ taskId, artifactId: drop }, makeAuthContext(member));

    await h.unlinkTaskArtifact({ taskId, artifactId: drop }, makeAuthContext(member));

    const res: any = await h.listTaskArtifactLinks({ taskId }, makeAuthContext(member));
    // Matching on the task alone would take the other artifact with it.
    expect(res.links.map((l: any) => l.artifactId)).toEqual([keep]);
  });

  it("is idempotent when unlinking something that is not linked", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-6", "T");
    const artifactId = await artifact("art-6", "a.md");

    const res: any = await handlerFor(db).unlinkTaskArtifact({ taskId, artifactId }, makeAuthContext(member));
    expect(res.success).toBe(true);
  });

  it("names the id when the artifact row has gone", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-7", "T");
    const artifactId = await artifact("art-7", "a.md");
    const h = handlerFor(db);
    await h.linkTaskArtifact({ taskId, artifactId }, makeAuthContext(member));
    await db.delete(schema.artifacts);

    const res: any = await h.listTaskArtifactLinks({ taskId }, makeAuthContext(member));
    // A blank name reads as a rendering bug; the id is at least identifiable.
    expect(res.links[0].artifactName).toBe(artifactId);
  });

  it("resolves a whole set of links in a fixed number of queries", async () => {
    const { db } = await setupIntegrationTest();
    const { member, task, artifact } = await seed(db);
    const taskId = await task("tsk-8", "T");
    const h = handlerFor(db);
    for (let i = 0; i < 8; i++) {
      await h.linkTaskArtifact({ taskId, artifactId: await artifact(`art-8-${i}`, `a${i}.md`) }, makeAuthContext(member));
    }

    let queries = 0;
    const counting = new Proxy(db, { get(t, p) { if (p === "select") queries++; return (t as any)[p]; } });
    const res: any = await handlerFor(counting).listTaskArtifactLinks({ taskId }, makeAuthContext(member));

    expect(res.links).toHaveLength(8);
    // The link rows, the authorization lookups, and one lookup per side — not
    // one per link. The per-link version returns identical data, so only a
    // count can tell them apart.
    expect(queries).toBeLessThan(8);
  });

  it("refuses to link a task and an artifact from different organizations", async () => {
    const { db } = await setupIntegrationTest();
    const a = await seed(db);
    const b = await seed(db);
    const taskId = await a.task("tsk-x", "Mine");
    const artifactId = await b.artifact("art-x", "theirs.md");

    await expect(
      handlerFor(db).linkTaskArtifact({ taskId, artifactId }, makeAuthContext(a.member)),
    ).rejects.toThrow();
  });
});
