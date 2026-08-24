import { describe, it, expect } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "./schema.sqlite";

/**
 * M29-T03. The table's contract, exercised against a real migrated database
 * rather than asserted against the schema object - the migration and the
 * drizzle definition are hand-kept in parallel and can disagree.
 */

async function seedUserInOrg(db: any, suffix: string) {
  const orgId = `org-${suffix}`;
  const userId = `user-${suffix}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: new Date() });
  return { orgId, userId };
}

function row(userId: string, orgId: string, over: Partial<any> = {}) {
  return {
    id: `ntf-${crypto.randomUUID()}`,
    userId,
    orgId,
    projectId: null,
    type: "task.stalled",
    title: "A claim went quiet",
    body: "T-1 has been silent for 30 hours.",
    targetPath: "/tasks/tsk-1?org=org-1&project=proj-1",
    dedupeKey: "tsk-1::1788400000000",
    createdAt: new Date(),
    readAt: null,
    ...over,
  };
}

describe("notifications table", () => {
  it("round-trips a row, with readAt null until it is read", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "n1");

    await db.insert(schema.notifications).values(row(userId, orgId));

    const found = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId));
    expect(found).toHaveLength(1);
    expect(found[0]!.readAt).toBeNull();
    expect(found[0]!.title).toBe("A claim went quiet");
    expect(found[0]!.targetPath).toContain("?org=");
  });

  it("rejects a second notification with the same (user, type, dedupeKey)", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "n2");

    await db.insert(schema.notifications).values(row(userId, orgId));
    // The same event redelivered, or a sweep re-publishing, must not produce
    // a second bell entry for the same person.
    // Wrapped in an async IIFE: drizzle's insert builder is a thenable, not
    // a Promise, and `.rejects` needs a real one.
    await expect((async () => { await db.insert(schema.notifications).values(row(userId, orgId)); })()).rejects.toThrow();
  });

  it("allows the same dedupeKey for a different recipient", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "n3");
    const second = "user-n3-b";
    await db.insert(schema.users).values({ id: second, email: "n3b@test.local", createdAt: new Date() });

    await db.insert(schema.notifications).values(row(userId, orgId));
    await db.insert(schema.notifications).values(row(second, orgId));

    const all = await db.select().from(schema.notifications);
    expect(all).toHaveLength(2);
  });

  it("allows the same dedupeKey under a different type", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "n4");

    await db.insert(schema.notifications).values(row(userId, orgId));
    await db.insert(schema.notifications).values(row(userId, orgId, { type: "task.handoff" }));

    expect(await db.select().from(schema.notifications)).toHaveLength(2);
  });

  it("supports the badge's unread query", async () => {
    const { db } = await setupIntegrationTest();
    const { orgId, userId } = await seedUserInOrg(db, "n5");

    await db.insert(schema.notifications).values(row(userId, orgId, { dedupeKey: "a" }));
    await db.insert(schema.notifications).values(row(userId, orgId, { dedupeKey: "b", readAt: new Date() }));

    const unread = await db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
    expect(unread).toHaveLength(1);
    expect(unread[0]!.dedupeKey).toBe("a");
  });
});
