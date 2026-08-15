import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { createTaskManagementHandler } from "./tasks.handler";

async function seed(db: any) {
  const s = String(Math.random()).slice(2);
  const orgId = `org-${s}`, member = `u-${s}`, other = `u2-${s}`;
  const templateId = `t-${s}`, projectId = `p-${s}`, taskId = `task-${s}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: "O", slug: orgId, createdAt: now });
  await db.insert(schema.users).values([
    { id: member, email: `${member}@t.test`, name: "Ada Lovelace", createdAt: now },
    { id: other, email: `${other}@t.test`, name: "", createdAt: now },
  ]);
  await db.insert(schema.organizationMembers).values([
    { orgId, userId: member, role: "admin", joinedAt: now },
    { orgId, userId: other, role: "member", joinedAt: now },
  ]);
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, ownerId: member, name: "P", key: "RV", createdAt: now });
  await db.insert(schema.tasks).values({ id: taskId, projectId, title: "T", status: "todo", createdAt: now });
  return { orgId, member, other, taskId };
}

const handlerFor = (db: any) => createTaskManagementHandler(db, null);

describe("listTaskReviewers carries display names", () => {
  it("names the reviewer, so a client does not need the member catalogue", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.addTaskReviewer({ taskId, userId: member }, makeAuthContext(member));

    const res: any = await handler.listTaskReviewers({ taskId }, makeAuthContext(member));

    // Holding the catalogue client-side is what made the first assignee picker
    // fetch 100,001 members (M05-T04).
    expect(res.reviewers).toHaveLength(1);
    expect(res.reviewers[0]).toEqual(expect.objectContaining({ userId: member, name: "Ada Lovelace" }));
  });

  it("falls back to the email when an account has no name", async () => {
    const { db } = await setupIntegrationTest();
    const { member, other, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.addTaskReviewer({ taskId, userId: other }, makeAuthContext(member));

    const res: any = await handler.listTaskReviewers({ taskId }, makeAuthContext(member));
    expect(res.reviewers[0].name).toBe(`${other}@t.test`);
  });

  it("falls back to the id when the account is gone entirely", async () => {
    const { db } = await setupIntegrationTest();
    const { member, other, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.addTaskReviewer({ taskId, userId: other }, makeAuthContext(member));
    await db.delete(schema.users).where(eq(schema.users.id, other));

    const res: any = await handler.listTaskReviewers({ taskId }, makeAuthContext(member));
    // A blank name would make the row look like a rendering bug. The id is at
    // least identifiable, and the reviewer record genuinely still exists.
    expect(res.reviewers[0].name).toBe(other);
  });

  it("returns an empty list for a task with no reviewers", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    const res: any = await handlerFor(db).listTaskReviewers({ taskId }, makeAuthContext(member));
    expect(res.reviewers).toEqual([]);
  });

  it("resolves several reviewers in one lookup", async () => {
    const { db } = await setupIntegrationTest();
    const { member, other, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.addTaskReviewer({ taskId, userId: member }, makeAuthContext(member));
    await handler.addTaskReviewer({ taskId, userId: other }, makeAuthContext(member));

    let queries = 0;
    const counting = new Proxy(db, { get(t, p) { if (p === "select") queries++; return (t as any)[p]; } });
    const res: any = await handlerFor(counting).listTaskReviewers({ taskId }, makeAuthContext(member));

    expect(res.reviewers).toHaveLength(2);
    // The reviewer rows, the org lookup and one name lookup - not one per name.
    expect(queries).toBeLessThan(6);
  });

  it("round-trips through add and remove", async () => {
    const { db } = await setupIntegrationTest();
    const { member, taskId } = await seed(db);
    const handler = handlerFor(db);
    await handler.addTaskReviewer({ taskId, userId: member }, makeAuthContext(member));
    expect((await handler.listTaskReviewers({ taskId }, makeAuthContext(member)) as any).reviewers).toHaveLength(1);

    await handler.removeTaskReviewer({ taskId, userId: member }, makeAuthContext(member));
    expect((await handler.listTaskReviewers({ taskId }, makeAuthContext(member)) as any).reviewers).toHaveLength(0);
  });
});
