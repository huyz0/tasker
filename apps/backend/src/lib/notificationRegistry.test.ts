import { describe, it, expect, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import {
  writeNotifications,
  registerNotificationType,
  unregisterNotificationType,
  notificationTypes,
  TASK_STALLED,
  type TaskStalledPayload,
  type RenderedNotification,
} from "./notificationRegistry";

/**
 * M29-T04. The central assertion here is the one M29's exit criteria name:
 * a second notification type reaches the database through the same write
 * path, with no edit to that path.
 */

async function seedUserInOrg(db: any, suffix: string) {
  const orgId = `org-${suffix}`;
  const userId = `user-${suffix}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: new Date() });
  return { orgId, userId };
}

const stalled = (orgId: string, over: Partial<TaskStalledPayload> = {}): TaskStalledPayload => ({
  orgId,
  projectId: "proj-1",
  taskId: "tsk-1",
  taskDisplayId: "T-1",
  taskTitle: "Wire the thing",
  agentName: "Builder",
  hoursSilent: 30,
  anchorAt: 1788400000000,
  ...over,
});

const FAKE_TYPE = "test.fake";
afterEach(() => unregisterNotificationType(FAKE_TYPE));

describe("notification registry", () => {
  it("renders and persists a stalled-claim notification per recipient", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g1");

    const written = await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [{ userId }]);
    expect(written).toBe(1);

    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("T-1 — Wire the thing");
    expect(rows[0]!.body).toBe("Builder's claim has been silent for 30 hours.");
    expect(rows[0]!.type).toBe(TASK_STALLED);
  });

  it("puts scope in the target path, so the link opens in the right project", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g2");

    await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [{ userId }]);
    const rows = await db.select().from(schema.notifications);

    // ADR-0025: a link without scope reopens under whatever project the
    // reader happened to have selected.
    expect(rows[0]!.targetPath).toBe(`/tasks/tsk-1?org=${orgId}&project=proj-1`);
  });

  it("writes one row per recipient", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g3");
    const second = "user-g3-b";
    await db.insert(schema.users).values({ id: second, email: "g3b@test.local", createdAt: new Date() });

    const written = await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [
      { userId },
      { userId: second },
    ]);
    expect(written).toBe(2);
  });

  it("silently skips a duplicate rather than notifying twice", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g4");

    expect(await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [{ userId }])).toBe(1);
    // Same event, redelivered.
    expect(await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [{ userId }])).toBe(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(1);
  });

  it("treats a new claim anchor on the same task as a new notification", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g5");

    await writeNotifications(db, true, TASK_STALLED, stalled(orgId), [{ userId }]);
    await writeNotifications(db, true, TASK_STALLED, stalled(orgId, { anchorAt: 1788999999999 }), [{ userId }]);

    expect(await db.select().from(schema.notifications)).toHaveLength(2);
  });

  it("falls back to the task id and a neutral actor when the payload is thin", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g6");

    await writeNotifications(db, true, TASK_STALLED, stalled(orgId, {
      taskDisplayId: undefined, taskTitle: undefined, agentName: null, hoursSilent: 1,
    }), [{ userId }]);

    const rows = await db.select().from(schema.notifications);
    expect(rows[0]!.title).toBe("tsk-1");
    expect(rows[0]!.body).toBe("The claim has been silent for 1 hour.");
  });

  it("returns zero and does not throw for an unregistered type", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g7");

    expect(await writeNotifications(db, true, "nope.not.registered", stalled(orgId), [{ userId }])).toBe(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
  });

  // ── M29's exit criterion: a second type needs no change to this file's
  //    write path, and none at all to the GUI component.
  it("persists a newly registered type through the same write path", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g8");

    const render = (p: any): RenderedNotification => ({
      title: `Handoff on ${p.taskId}`,
      body: "Someone left you a note.",
      targetPath: `/tasks/${p.taskId}?org=${p.orgId}`,
      dedupeKey: `${p.taskId}::handoff`,
      orgId: p.orgId,
      projectId: null,
    });
    registerNotificationType(FAKE_TYPE, render);

    const written = await writeNotifications(db, true, FAKE_TYPE, { orgId, taskId: "tsk-9" }, [{ userId }]);
    expect(written).toBe(1);

    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.type, FAKE_TYPE));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Handoff on tsk-9");
    expect(rows[0]!.projectId).toBeNull();
    expect(notificationTypes()).toContain(FAKE_TYPE);
  });

  it("lets a renderer decline by returning null", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "g9");

    registerNotificationType(FAKE_TYPE, () => null);
    expect(await writeNotifications(db, true, FAKE_TYPE, { orgId }, [{ userId }])).toBe(0);
    expect(await db.select().from(schema.notifications)).toHaveLength(0);
  });
});
