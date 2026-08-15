import { describe, test, expect } from "bun:test";
import { createContextValues } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createCommentsHandler } from "./comments.handler";
import { createTaskNotesHandler } from "../tasks/task_notes.handler";
import { currentPrincipalKey, type Principal } from "../auth/session";

/** A context carrying an agent principal, as the interceptor would build it. */
const agentContext = (p: Omit<Extract<Principal, { kind: "agent" }>, "kind">) => {
  const values = createContextValues();
  values.set(currentPrincipalKey, { kind: "agent", ...p });
  return { values } as any;
};

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, otherOrg = `oorg-${s}`;
  const human = `human-${s}`, roleId = `role-${s}`;
  const agentId = `agent-${s}`, otherAgentId = `agent2-${s}`, foreignAgentId = `fagent-${s}`;
  const templateId = `tmpl-${s}`, projectId = `proj-${s}`, taskId = `task-${s}`;

  await db.insert(schema.organizations).values([
    { id: orgId, name: "O", slug: orgId, createdAt: new Date() },
    { id: otherOrg, name: "P", slug: otherOrg, createdAt: new Date() },
  ]);
  await db.insert(schema.users).values({ id: human, email: `${human}@t.test`, name: "H", createdAt: new Date() });
  await db.insert(schema.organizationMembers).values({ orgId, userId: human, role: "member", joinedAt: new Date() });
  await db.insert(schema.agentRoles).values([
    { id: roleId, orgId, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() },
    { id: `${roleId}-f`, orgId: otherOrg, name: "R", systemPrompt: "p", capabilities: "[]", createdAt: new Date() },
  ]);
  await db.insert(schema.agents).values([
    { id: agentId, orgId, agentRoleId: roleId, name: "A", createdAt: new Date() },
    { id: otherAgentId, orgId, agentRoleId: roleId, name: "B", createdAt: new Date() },
    { id: foreignAgentId, orgId: otherOrg, agentRoleId: `${roleId}-f`, name: "F", createdAt: new Date() },
  ]);
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: human, name: "P", key: "K", createdAt: new Date() });
  await db.insert(schema.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: new Date() });

  return { orgId, otherOrg, human, agentId, otherAgentId, foreignAgentId, taskId };
}

const agentP = (agentId: string, orgId: string) => agentContext({ agentId, orgId, tokenId: "tok", scopes: ["tasks:read", "tasks:write", "comments:write"] });

describe("comment attribution comes from the principal", () => {
  test("a human session can no longer author a comment as an agent", async () => {
    const { db } = await setupIntegrationTest();
    const { human, taskId, agentId } = await seed(db);
    const handler = createCommentsHandler(db, null);

    // The whole reason M04 exists: this used to attribute the comment to the
    // named agent purely because the caller said so.
    const res: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "hi", agentId } as any,
      makeAuthContext(human),
    );

    expect(res.comment.agentId).toBeNull();
    expect(res.comment.userId).toBe(human);
  });

  test("an agent principal authors as itself", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId, agentId } = await seed(db);
    const res: any = await createCommentsHandler(db, null).createComment(
      { entityId: taskId, entityType: "task", content: "from the agent" },
      agentP(agentId, orgId),
    );
    expect(res.comment.agentId).toBe(agentId);
    expect(res.comment.userId).toBeNull();
  });

  test("an agent cannot comment on another organization's task", async () => {
    const { db } = await setupIntegrationTest();
    const { taskId, foreignAgentId, otherOrg } = await seed(db);
    try {
      await createCommentsHandler(db, null).createComment(
        { entityId: taskId, entityType: "task", content: "x" },
        agentP(foreignAgentId, otherOrg),
      );
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  test("an unauthenticated caller cannot comment at all", async () => {
    const { db } = await setupIntegrationTest();
    const { taskId } = await seed(db);
    await expect(createCommentsHandler(db, null).createComment(
      { entityId: taskId, entityType: "task", content: "x" },
      makeAuthContext(null),
    )).rejects.toThrow(ConnectError);
  });
});

describe("comment authorship is enforced against the principal", () => {
  test("a human cannot edit an agent's comment by naming the agent", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, human, taskId, agentId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "agent wrote this" },
      agentP(agentId, orgId),
    );

    // Before M04 this succeeded: assertCommentAuthor compared the stored
    // agentId against one taken from the request body.
    try {
      await handler.updateComment(
        { commentId: created.comment.id, content: "tampered", agentId } as any,
        makeAuthContext(human),
      );
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  test("a human cannot delete an agent's comment by naming the agent", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, human, taskId, agentId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "agent wrote this" },
      agentP(agentId, orgId),
    );
    await expect(handler.deleteComment(
      { commentId: created.comment.id, agentId } as any,
      makeAuthContext(human),
    )).rejects.toThrow(ConnectError);
  });

  test("an agent cannot edit a different agent's comment", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId, agentId, otherAgentId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "mine" },
      agentP(agentId, orgId),
    );
    await expect(handler.updateComment(
      { commentId: created.comment.id, content: "not yours" },
      agentP(otherAgentId, orgId),
    )).rejects.toThrow(ConnectError);
  });

  test("an agent can edit its own comment", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId, agentId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "mine" },
      agentP(agentId, orgId),
    );
    const updated: any = await handler.updateComment(
      { commentId: created.comment.id, content: "revised" },
      agentP(agentId, orgId),
    );
    expect(updated.comment.content).toBe("revised");
  });

  test("a human can still edit their own comment", async () => {
    const { db } = await setupIntegrationTest();
    const { human, taskId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "mine" },
      makeAuthContext(human),
    );
    const updated: any = await handler.updateComment(
      { commentId: created.comment.id, content: "revised" },
      makeAuthContext(human),
    );
    expect(updated.comment.content).toBe("revised");
  });

  test("an agent cannot edit a human's comment", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, human, taskId, agentId } = await seed(db);
    const handler = createCommentsHandler(db, null);
    const created: any = await handler.createComment(
      { entityId: taskId, entityType: "task", content: "human wrote this" },
      makeAuthContext(human),
    );
    await expect(handler.updateComment(
      { commentId: created.comment.id, content: "tampered" },
      agentP(agentId, orgId),
    )).rejects.toThrow(ConnectError);
  });
});

describe("task note attribution", () => {
  test("an agent principal authors the note as itself", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, taskId, agentId } = await seed(db);
    const res: any = await createTaskNotesHandler(db, null).createTaskNote(
      { taskId, content: "progress" },
      agentP(agentId, orgId),
    );
    expect(res.taskNote.agentId).toBe(agentId);
  });

  test("a human cannot author a note as an agent — task notes are the agent's own record", async () => {
    const { db } = await setupIntegrationTest();
    const { human, taskId, agentId } = await seed(db);
    // task_notes.agent_id is NOT NULL, so a note has no meaningful human
    // author. Before M04 a human supplied the agentId and the note was filed
    // under a worker that never wrote it.
    try {
      await createTaskNotesHandler(db, null).createTaskNote(
        { taskId, content: "x", agentId } as any,
        makeAuthContext(human),
      );
      throw new Error("expected a rejection");
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  test("an agent cannot write a note on another organization's task", async () => {
    const { db } = await setupIntegrationTest();
    const { taskId, foreignAgentId, otherOrg } = await seed(db);
    await expect(createTaskNotesHandler(db, null).createTaskNote(
      { taskId, content: "x" },
      agentP(foreignAgentId, otherOrg),
    )).rejects.toThrow(ConnectError);
  });
});
