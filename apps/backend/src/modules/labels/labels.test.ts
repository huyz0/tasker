import { describe, it, expect, beforeEach } from "bun:test";
import { Code } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { createLabelsHandler } from "./labels.handler";

describe("Labels Handler", () => {
  let db: any;
  let handler: ReturnType<typeof createLabelsHandler>;
  let ctx: any;
  let orgId: string;
  let userId: string;
  let taskId: string;
  let artifactId: string;

  beforeEach(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    handler = createLabelsHandler(db, null);

    orgId = "org-" + crypto.randomUUID();
    userId = "user-" + crypto.randomUUID();
    const templateId = "tmpl-" + crypto.randomUUID();
    const projectId = "proj-" + crypto.randomUUID();
    const folderId = "fld-" + crypto.randomUUID();
    taskId = "tsk-" + crypto.randomUUID();
    artifactId = "art-" + crypto.randomUUID();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });

    ctx = makeAuthContext(userId);
  });

  // --- createLabel ---

  it("should create a label for an org", async () => {
    const res = await handler.createLabel({ orgId, name: "bug", color: "#ff0000" }, ctx);
    expect(res.label).toBeDefined();
    expect(res.label.name).toBe("bug");
    expect(res.label.id).toStartWith("lbl-");
  });

  it("should reject createLabel with missing name", async () => {
    expect(handler.createLabel({ orgId, name: "" }, ctx)).rejects.toThrow();
  });

  it("should reject createLabel with a color longer than the DB column allows", async () => {
    // The color column is varchar(32) in MySQL - a longer value must be
    // rejected at validation time rather than silently truncating or
    // erroring at the DB layer.
    expect(handler.createLabel({ orgId, name: "bug", color: "#" + "f".repeat(40) }, ctx)).rejects.toThrow();
  });

  it("should reject createLabel from a user outside the org", async () => {
    expect(handler.createLabel({ orgId, name: "bug" }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  it("should reject createLabel with a name already used in this org", async () => {
    await handler.createLabel({ orgId, name: "bug" }, ctx);
    await expect(handler.createLabel({ orgId, name: "bug" }, ctx)).rejects.toThrow();
  });

  it("should reject one of two concurrent createLabel calls racing for the same name, as AlreadyExists rather than a raw DB error", async () => {
    const results = await Promise.allSettled([
      handler.createLabel({ orgId, name: "race" }, ctx),
      handler.createLabel({ orgId, name: "race" }, ctx),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(Code.AlreadyExists);
  });

  it("should allow the same label name in a different org", async () => {
    await handler.createLabel({ orgId, name: "bug" }, ctx);
    const otherOrgId = "org-other-" + crypto.randomUUID();
    const otherUserId = "user-other-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other Org", slug: "org-other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: otherUserId, email: `${otherUserId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId: otherUserId, role: "admin", joinedAt: new Date() });

    const res = await handler.createLabel({ orgId: otherOrgId, name: "bug" }, makeAuthContext(otherUserId));
    expect(res.label.name).toBe("bug");
  });

  // --- listLabels ---

  it("should list labels for an org", async () => {
    await handler.createLabel({ orgId, name: "bug" }, ctx);
    await handler.createLabel({ orgId, name: "feature" }, ctx);
    const res = await handler.listLabels({ orgId }, ctx);
    expect(res.labels).toHaveLength(2);
    expect(res.labels.map((l: any) => l.name)).toContain("feature");
  });

  it("should reject listLabels from a user outside the org", async () => {
    expect(handler.listLabels({ orgId }, makeAuthContext("user-outsider"))).rejects.toThrow();
  });

  it("should filter and sort labels by name", async () => {
    await handler.createLabel({ orgId, name: "zebra" }, ctx);
    await handler.createLabel({ orgId, name: "alpha" }, ctx);

    const filtered = await handler.listLabels({ orgId, page: { filter: "zebra" } }, ctx);
    expect(filtered.labels.every((l: any) => l.name.includes("zebra"))).toBe(true);
    expect(filtered.labels.length).toBeGreaterThan(0);

    const sorted = await handler.listLabels({ orgId, page: { sort: "name:asc" } }, ctx);
    const names = sorted.labels.map((l: any) => l.name);
    expect(names.indexOf("alpha")).toBeLessThan(names.indexOf("zebra"));
  });

  it("treats _ in the filter as a literal character, not a SQL single-char wildcard", async () => {
    await handler.createLabel({ orgId, name: "foo_bar" }, ctx);
    await handler.createLabel({ orgId, name: "foobar" }, ctx);

    // Unescaped, the pattern "%o_b%" would also match "foobar" via its "oob"
    // substring (the "_" wildcard matching the middle "o").
    const filtered = await handler.listLabels({ orgId, page: { filter: "o_b" } }, ctx);
    const names = filtered.labels.map((l: any) => l.name);
    expect(names).toContain("foo_bar");
    expect(names).not.toContain("foobar");
  });

  // --- attachLabel / listEntityLabels / detachLabel ---

  it("should attach a label to a task and list it", async () => {
    const created = await handler.createLabel({ orgId, name: "bug" }, ctx);
    await handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    const res = await handler.listEntityLabels({ entityId: taskId, entityType: "task" }, ctx);
    expect(res.labels).toHaveLength(1);
    expect(res.labels[0].name).toBe("bug");
  });

  it("should attach a label to an artifact", async () => {
    const created = await handler.createLabel({ orgId, name: "reviewed" }, ctx);
    await handler.attachLabel({ entityId: artifactId, entityType: "artifact", labelId: created.label.id }, ctx);
    const res = await handler.listEntityLabels({ entityId: artifactId, entityType: "artifact" }, ctx);
    expect(res.labels).toHaveLength(1);
  });

  it("should be idempotent when attaching the same label twice", async () => {
    const created = await handler.createLabel({ orgId, name: "bug" }, ctx);
    await handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    await handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    const res = await handler.listEntityLabels({ entityId: taskId, entityType: "task" }, ctx);
    expect(res.labels).toHaveLength(1);
  });

  it("should not create duplicate links when two attachLabel calls race for the same entity+label", async () => {
    const created = await handler.createLabel({ orgId, name: "race-attach" }, ctx);
    const results = await Promise.allSettled([
      handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx),
      handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const res = await handler.listEntityLabels({ entityId: taskId, entityType: "task" }, ctx);
    expect(res.labels).toHaveLength(1);
  });

  it("should reject attaching a label from a different org", async () => {
    const otherOrgId = "org-" + crypto.randomUUID();
    await db.insert(schemaSqlite.organizations).values({ id: otherOrgId, name: "Other", slug: "other-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId: otherOrgId, userId, role: "admin", joinedAt: new Date() });
    const created = await handler.createLabel({ orgId: otherOrgId, name: "bug" }, ctx);

    expect(
      handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx)
    ).rejects.toThrow();
  });

  it("should detach a label from a task", async () => {
    const created = await handler.createLabel({ orgId, name: "bug" }, ctx);
    await handler.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    await handler.detachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    const res = await handler.listEntityLabels({ entityId: taskId, entityType: "task" }, ctx);
    expect(res.labels).toHaveLength(0);
  });

  it("should reject listEntityLabels from a user outside the entity's org", async () => {
    expect(
      handler.listEntityLabels({ entityId: taskId, entityType: "task" }, makeAuthContext("user-outsider"))
    ).rejects.toThrow();
  });

  // --- NATS event publishing ---

  it("should publish NATS event on label attach", async () => {
    let published: { subject: string } | null = null;
    const mockNc = { publish: (subject: string) => { published = { subject }; } };
    const h = createLabelsHandler(db, mockNc);
    const created = await h.createLabel({ orgId, name: "bug" }, ctx);
    await h.attachLabel({ entityId: taskId, entityType: "task", labelId: created.label.id }, ctx);
    expect(published).not.toBeNull();
    expect(published!.subject).toBe("domain.label.attached");
  });
});
