import { expect, test, describe } from "bun:test";
import { eq, and } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schemaSqlite from "../db/schema.sqlite";
import { purgeTaskCascade, purgeArtifactCascade, purgeOrgCascade } from "./cascadePurge";

describe("cascadePurge", () => {
  test("purgeTaskCascade deletes the task's entityLabels rows", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-" + Date.now();
    const userId = "user-cascade-" + Date.now();
    const templateId = "tmpl-cascade-" + Date.now();
    const projectId = "proj-cascade-" + Date.now();
    const taskId = "tsk-cascade-" + Date.now();
    const labelId = "lbl-cascade-" + Date.now();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-cascade-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: "Task", status: "todo", createdAt: new Date() });
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId, name: "cascade-label", createdAt: new Date() });
    await db.insert(schemaSqlite.entityLabels).values({ id: "el-cascade-" + Date.now(), entityId: taskId, entityType: "task", labelId, createdAt: new Date() });

    await purgeTaskCascade(db, taskId);

    const remaining = await db.select().from(schemaSqlite.entityLabels).where(and(eq(schemaSqlite.entityLabels.entityId, taskId), eq(schemaSqlite.entityLabels.entityType, "task")));
    expect(remaining.length).toBe(0);
  });

  test("purgeArtifactCascade deletes the artifact's entityLabels rows", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-art-" + Date.now();
    const userId = "user-cascade-art-" + Date.now();
    const templateId = "tmpl-cascade-art-" + Date.now();
    const projectId = "proj-cascade-art-" + Date.now();
    const folderId = "fld-cascade-art-" + Date.now();
    const artifactId = "art-cascade-" + Date.now();
    const labelId = "lbl-cascade-art-" + Date.now();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-cascade-art-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: "Folder", createdAt: new Date() });
    await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: "Artifact", createdAt: new Date() });
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId, name: "cascade-art-label", createdAt: new Date() });
    await db.insert(schemaSqlite.entityLabels).values({ id: "el-cascade-art-" + Date.now(), entityId: artifactId, entityType: "artifact", labelId, createdAt: new Date() });

    await purgeArtifactCascade(db, artifactId);

    const remaining = await db.select().from(schemaSqlite.entityLabels).where(and(eq(schemaSqlite.entityLabels.entityId, artifactId), eq(schemaSqlite.entityLabels.entityType, "artifact")));
    expect(remaining.length).toBe(0);
  });

  test("purgeOrgCascade deletes the org's labels, projectTemplates, and taskTypes (with their statuses/transitions)", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-org-" + Date.now();
    const labelId = "lbl-cascade-org-" + Date.now();
    const templateId = "tmpl-cascade-org-" + Date.now();
    const taskTypeId = "tt-cascade-org-" + Date.now();
    const statusId = "ts-cascade-org-" + Date.now();
    const otherStatusId = "ts-cascade-org-2-" + Date.now();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: "org-cascade-org-" + Date.now(), createdAt: new Date() });
    await db.insert(schemaSqlite.labels).values({ id: labelId, orgId, name: "cascade-org-label", createdAt: new Date() });
    await db.insert(schemaSqlite.taskTypes).values({ id: taskTypeId, orgId, name: "Custom Type", createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", rootTaskTypeId: taskTypeId, createdAt: new Date() });
    await db.insert(schemaSqlite.taskStatuses).values({ id: statusId, taskTypeId, name: "backlog" });
    await db.insert(schemaSqlite.taskStatuses).values({ id: otherStatusId, taskTypeId, name: "shipped" });
    await db.insert(schemaSqlite.taskStatusTransitions).values({ id: "tst-cascade-org-" + Date.now(), taskTypeId, fromStatusId: statusId, toStatusId: otherStatusId });

    await purgeOrgCascade(db, orgId);

    const remainingOrg = await db.select().from(schemaSqlite.organizations).where(eq(schemaSqlite.organizations.id, orgId));
    expect(remainingOrg.length).toBe(0);
    const remainingLabels = await db.select().from(schemaSqlite.labels).where(eq(schemaSqlite.labels.id, labelId));
    expect(remainingLabels.length).toBe(0);
    const remainingTemplates = await db.select().from(schemaSqlite.projectTemplates).where(eq(schemaSqlite.projectTemplates.id, templateId));
    expect(remainingTemplates.length).toBe(0);
    const remainingTaskTypes = await db.select().from(schemaSqlite.taskTypes).where(eq(schemaSqlite.taskTypes.id, taskTypeId));
    expect(remainingTaskTypes.length).toBe(0);
    const remainingStatuses = await db.select().from(schemaSqlite.taskStatuses).where(eq(schemaSqlite.taskStatuses.taskTypeId, taskTypeId));
    expect(remainingStatuses.length).toBe(0);
    const remainingTransitions = await db.select().from(schemaSqlite.taskStatusTransitions).where(eq(schemaSqlite.taskStatusTransitions.taskTypeId, taskTypeId));
    expect(remainingTransitions.length).toBe(0);
  });
});
