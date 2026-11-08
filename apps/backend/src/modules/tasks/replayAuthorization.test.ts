import { describe, it, expect } from "bun:test";
import { Code, createContextValues } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from "../../test/setup";
import * as S from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createTaskManagementHandler } from "./tasks.handler";

async function fixture() {
  const { db, nc } = await setupIntegrationTest();
  const orgId = "org-replay", userId = "user-replay", projectId = "project-replay";
  await seedOrgWithAdmin(db, { orgId, userId });
  await seedProject(db, { orgId, userId, projectId, templateId: "template-replay" });
  return { db, orgId, userId, projectId, handler: createTaskManagementHandler(db, nc), ctx: makeAuthContext(userId) };
}

describe("current authorization before keyed task response replay", () => {
  it("denies a create replay after membership removal without creating another task", async () => {
    const { db, userId, projectId, handler, ctx } = await fixture();
    const req = { projectId, title: "private task", status: "todo", idempotencyKey: "create" };
    const original = await handler.createTask(req, ctx);
    expect((await handler.createTask(req, ctx)).task.id).toBe(original.task.id);
    await db.delete(S.organizationMembers).where(eq(S.organizationMembers.userId, userId));
    await expect(handler.createTask(req, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(await db.select().from(S.tasks)).toHaveLength(1);
  });

  it("denies a claim replay after the caller becomes a viewer", async () => {
    const { db, userId, projectId, handler, ctx } = await fixture();
    const { task } = await handler.createTask({ projectId, title: "claim", status: "todo" }, ctx);
    const req = { taskId: task.id, idempotencyKey: "claim" };
    await handler.claimTask(req, ctx);
    await db.update(S.organizationMembers).set({ role: "viewer" }).where(eq(S.organizationMembers.userId, userId));
    await expect(handler.claimTask(req, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(await db.select().from(S.taskAssignments)).toHaveLength(1);
  });

  it("denies claim-next replay to a narrower replacement token for the same agent", async () => {
    const { db, orgId, projectId, handler, ctx } = await fixture();
    await db.insert(S.agentRoles).values({ id: "role-replay", orgId, name: "worker", systemPrompt: "", capabilities: "[]" });
    await db.insert(S.agents).values({ id: "agent-replay", orgId, agentRoleId: "role-replay", name: "worker" });
    await handler.createTask({ projectId, title: "next", status: "todo" }, ctx);
    const agent = (tokenId: string, scopes: string[]) => {
      const values = createContextValues();
      values.set(currentPrincipalKey, { kind: "agent", agentId: "agent-replay", orgId, tokenId, scopes });
      return { values };
    };
    const req = { projectId, idempotencyKey: "next" };
    const first: any = await handler.claimNextTask(req, agent("old", ["tasks:write"]));
    const replay: any = await handler.claimNextTask(req, agent("rotated", ["tasks:write"]));
    expect(replay.task?.id).toBe(first.task?.id);
    await expect(handler.claimNextTask(req, agent("narrow", ["tasks:read"]))).rejects.toMatchObject({ code: Code.PermissionDenied });
    expect(await db.select().from(S.taskAssignments)).toHaveLength(1);
  });
});
