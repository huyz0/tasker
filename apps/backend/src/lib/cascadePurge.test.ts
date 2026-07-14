import { expect, test, describe } from "bun:test";
import { eq, and, inArray } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schemaSqlite from "../db/schema.sqlite";
import { purgeTaskCascade, purgeArtifactCascade, purgeOrgCascade, purgeProjectCascade, purgeFolderCascade } from "./cascadePurge";

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

  // These exercise the bulk-collect-then-inArray-delete paths with more
  // than one row per table - the actual risk surface of switching from a
  // per-child-row loop to a single SELECT + bulk DELETE per table.
  test("purgeFolderCascade removes a multi-level folder tree and every artifact beneath it", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-tree-" + Date.now();
    const userId = "user-cascade-tree-" + Date.now();
    const templateId = "tmpl-cascade-tree-" + Date.now();
    const projectId = "proj-cascade-tree-" + Date.now();
    const rootId = "fld-root-" + Date.now();
    const childId = "fld-child-" + Date.now();
    const grandchildId = "fld-grandchild-" + Date.now();
    const artifactIds = [rootId, childId, grandchildId].map((f) => `art-${f}`);

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: rootId, projectId, name: "root", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: childId, projectId, parentId: rootId, name: "child", createdAt: new Date() });
    await db.insert(schemaSqlite.folders).values({ id: grandchildId, projectId, parentId: childId, name: "grandchild", createdAt: new Date() });
    for (const [folderId, artifactId] of [[rootId, artifactIds[0]], [childId, artifactIds[1]], [grandchildId, artifactIds[2]]] as const) {
      await db.insert(schemaSqlite.artifacts).values({ id: artifactId, folderId, name: artifactId, createdAt: new Date() });
    }

    await purgeFolderCascade(db, rootId);

    const remainingFolders = await db.select().from(schemaSqlite.folders).where(inArray(schemaSqlite.folders.id, [rootId, childId, grandchildId]));
    expect(remainingFolders.length).toBe(0);
    const remainingArtifacts = await db.select().from(schemaSqlite.artifacts).where(inArray(schemaSqlite.artifacts.id, artifactIds));
    expect(remainingArtifacts.length).toBe(0);
  });

  test("purgeProjectCascade removes multiple tasks, folders, repository links, and task types in one pass", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-proj-" + Date.now();
    const userId = "user-cascade-proj-" + Date.now();
    const templateId = "tmpl-cascade-proj-" + Date.now();
    const projectId = "proj-cascade-proj-" + Date.now();
    const taskIds = ["tsk-a-" + Date.now(), "tsk-b-" + Date.now()];
    const folderIds = ["fld-a-" + Date.now(), "fld-b-" + Date.now()];
    const repoLinkIds = ["repo-a-" + Date.now(), "repo-b-" + Date.now()];
    const taskTypeId = "tt-cascade-proj-" + Date.now();
    const statusId = "ts-cascade-proj-" + Date.now();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.users).values({ id: userId, email: `${userId}@test.com`, createdAt: new Date() });
    await db.insert(schemaSqlite.projectTemplates).values({ id: templateId, orgId, name: "Tmpl", createdAt: new Date() });
    await db.insert(schemaSqlite.projects).values({ id: projectId, orgId, templateId, ownerId: userId, name: "Proj", createdAt: new Date() });
    for (const taskId of taskIds) {
      await db.insert(schemaSqlite.tasks).values({ id: taskId, projectId, title: taskId, status: "todo", createdAt: new Date() });
    }
    for (const folderId of folderIds) {
      await db.insert(schemaSqlite.folders).values({ id: folderId, projectId, name: folderId, createdAt: new Date() });
    }
    for (const repoLinkId of repoLinkIds) {
      await db.insert(schemaSqlite.repositoryLinks).values({ id: repoLinkId, projectId, provider: "github", remoteName: "org/repo", accessTokenEncrypted: "enc", createdAt: new Date() });
      await db.insert(schemaSqlite.remotePullRequests).values({ id: `pr-${repoLinkId}`, repositoryLinkId: repoLinkId, remotePrId: "1", title: "PR", status: "open", url: "https://example.com", updatedAt: new Date() });
    }
    await db.insert(schemaSqlite.taskTypes).values({ id: taskTypeId, orgId, projectId, name: "Type", createdAt: new Date() });
    await db.insert(schemaSqlite.taskStatuses).values({ id: statusId, taskTypeId, name: "backlog" });

    await purgeProjectCascade(db, projectId);

    expect((await db.select().from(schemaSqlite.projects).where(eq(schemaSqlite.projects.id, projectId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.tasks).where(inArray(schemaSqlite.tasks.id, taskIds))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.folders).where(inArray(schemaSqlite.folders.id, folderIds))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.repositoryLinks).where(inArray(schemaSqlite.repositoryLinks.id, repoLinkIds))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.remotePullRequests).where(inArray(schemaSqlite.remotePullRequests.repositoryLinkId, repoLinkIds))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.taskTypes).where(eq(schemaSqlite.taskTypes.id, taskTypeId))).length).toBe(0);
    expect((await db.select().from(schemaSqlite.taskStatuses).where(eq(schemaSqlite.taskStatuses.taskTypeId, taskTypeId))).length).toBe(0);
  });

  test("purgeOrgCascade nulls out comment.agentId and removes multiple agents", async () => {
    const { db } = await setupIntegrationTest();

    const orgId = "org-cascade-agents-" + Date.now();
    const agentRoleId = "role-cascade-" + Date.now();
    const agentIds = ["agt-a-" + Date.now(), "agt-b-" + Date.now()];
    const taskId = "tsk-cascade-agents-" + Date.now();

    await db.insert(schemaSqlite.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
    await db.insert(schemaSqlite.agentRoles).values({ id: agentRoleId, name: "Role", systemPrompt: "p", capabilities: "[]", createdAt: new Date() });
    for (const agentId of agentIds) {
      await db.insert(schemaSqlite.agents).values({ id: agentId, orgId, agentRoleId, name: agentId, createdAt: new Date() });
    }
    await db.insert(schemaSqlite.comments).values({ id: "cmt-cascade-" + Date.now(), entityId: taskId, entityType: "task", agentId: agentIds[0], content: "hi", createdAt: new Date() });

    await purgeOrgCascade(db, orgId);

    expect((await db.select().from(schemaSqlite.agents).where(inArray(schemaSqlite.agents.id, agentIds))).length).toBe(0);
    const remainingComment = await db.select().from(schemaSqlite.comments).where(eq(schemaSqlite.comments.entityId, taskId));
    expect(remainingComment[0]?.agentId).toBeNull();
  });
});
