import { describe, it, expect, beforeEach } from "bun:test";
import { createContextValues } from "@connectrpc/connect";
import { setupIntegrationTest } from "../../test/setup";
import * as schema from "../../db/schema.sqlite";
import { currentPrincipalKey } from "../auth/session";
import { createNotificationHandler } from "./notifications.handler";

/**
 * M29-T05. The load-bearing assertion is cross-user isolation: a notification
 * belongs to exactly one person, and no request shape lets another person
 * reach it.
 */

function asUser(userId: string) {
  const values = createContextValues();
  values.set(currentPrincipalKey, { kind: "user", userId } as any);
  return { values };
}

async function seed(db: any) {
  const now = new Date();
  await db.insert(schema.organizations).values({ id: "org-n", name: "Org", slug: "org-n", createdAt: now });
  await db.insert(schema.organizations).values({ id: "org-other", name: "Other", slug: "org-other", createdAt: now });
  for (const id of ["alice", "bob"]) {
    await db.insert(schema.users).values({ id, email: `${id}@test.local`, createdAt: now });
    await db.insert(schema.organizationMembers).values({ orgId: "org-n", userId: id, role: "member", joinedAt: now });
  }
}

async function note(db: any, id: string, userId: string, over: Partial<any> = {}) {
  await db.insert(schema.notifications).values({
    id,
    userId,
    orgId: "org-n",
    projectId: "proj-1",
    type: "task.stalled",
    title: `Title ${id}`,
    body: "Body",
    targetPath: "/tasks/t1?org=org-n&project=proj-1",
    dedupeKey: id,
    createdAt: new Date(),
    readAt: null,
    ...over,
  });
}

let db: any;
let handler: ReturnType<typeof createNotificationHandler>;

beforeEach(async () => {
  ({ db } = await setupIntegrationTest());
  await seed(db);
  handler = createNotificationHandler(db);
  process.env.STANDALONE = "true";
});

describe("listNotifications", () => {
  it("returns only the caller's own notifications", async () => {
    await note(db, "ntf-a", "alice");
    await note(db, "ntf-b", "bob");

    const res = await handler.listNotifications({ orgId: "org-n" }, asUser("alice"));
    expect(res.notifications).toHaveLength(1);
    expect(res.notifications[0]!.id).toBe("ntf-a");
  });

  it("filters to unread when asked", async () => {
    await note(db, "ntf-1", "alice");
    await note(db, "ntf-2", "alice", { readAt: new Date() });

    const all = await handler.listNotifications({ orgId: "org-n" }, asUser("alice"));
    expect(all.notifications).toHaveLength(2);

    const unread = await handler.listNotifications({ orgId: "org-n", unreadOnly: true }, asUser("alice"));
    expect(unread.notifications).toHaveLength(1);
    expect(unread.notifications[0]!.id).toBe("ntf-1");
  });

  it("serializes timestamps as strings, not Dates", async () => {
    await note(db, "ntf-s", "alice");
    const res = await handler.listNotifications({ orgId: "org-n" }, asUser("alice"));
    // A raw Date crashes connect's protobuf JSON encoder outright.
    expect(typeof res.notifications[0]!.createdAt).toBe("string");
    expect(res.notifications[0]!.readAt).toBeUndefined();
  });

  it("refuses a caller who is not a member of the org", async () => {
    await db.insert(schema.users).values({ id: "carol", email: "c@test.local", createdAt: new Date() });
    await expect(handler.listNotifications({ orgId: "org-n" }, asUser("carol"))).rejects.toThrow();
  });
});

describe("getUnreadNotificationCount", () => {
  it("counts only the caller's own unread", async () => {
    await note(db, "ntf-a1", "alice");
    await note(db, "ntf-a2", "alice");
    await note(db, "ntf-a3", "alice", { readAt: new Date() });
    await note(db, "ntf-b1", "bob");

    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("alice"))).count).toBe(2);
    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("bob"))).count).toBe(1);
  });

  it("is zero for a member with none", async () => {
    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("alice"))).count).toBe(0);
  });
});

describe("markNotificationRead", () => {
  it("marks the caller's own notification read", async () => {
    await note(db, "ntf-a", "alice");
    const res = await handler.markNotificationRead({ id: "ntf-a" }, asUser("alice"));
    expect(res.notification.readAt).toBeDefined();
    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("alice"))).count).toBe(0);
  });

  it("cannot mark someone else's notification, and does not confirm it exists", async () => {
    await note(db, "ntf-b", "bob");
    // Not-found rather than permission-denied: a 403 here would tell alice
    // that ntf-b is a real notification belonging to someone.
    await expect(handler.markNotificationRead({ id: "ntf-b" }, asUser("alice"))).rejects.toThrow(/not_found/);

    // And bob's is untouched.
    const bobs = await handler.listNotifications({ orgId: "org-n" }, asUser("bob"));
    expect(bobs.notifications[0]!.readAt).toBeUndefined();
  });

  it("is idempotent and keeps the first-read timestamp", async () => {
    await note(db, "ntf-a", "alice");
    const first = await handler.markNotificationRead({ id: "ntf-a" }, asUser("alice"));
    const second = await handler.markNotificationRead({ id: "ntf-a" }, asUser("alice"));
    expect(second.notification.readAt).toBe(first.notification.readAt!);
  });

  it("rejects an id that does not exist at all", async () => {
    await expect(handler.markNotificationRead({ id: "ntf-nope" }, asUser("alice"))).rejects.toThrow(/not_found/);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks only the caller's own, and reports how many", async () => {
    await note(db, "ntf-a1", "alice");
    await note(db, "ntf-a2", "alice");
    await note(db, "ntf-b1", "bob");

    const res = await handler.markAllNotificationsRead({ orgId: "org-n" }, asUser("alice"));
    expect(res.markedCount).toBe(2);

    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("alice"))).count).toBe(0);
    // Bob's is untouched.
    expect((await handler.getUnreadNotificationCount({ orgId: "org-n" }, asUser("bob"))).count).toBe(1);
  });

  it("reports zero when there was nothing unread", async () => {
    await note(db, "ntf-a", "alice", { readAt: new Date() });
    expect((await handler.markAllNotificationsRead({ orgId: "org-n" }, asUser("alice"))).markedCount).toBe(0);
  });

  it("refuses a non-member", async () => {
    await db.insert(schema.users).values({ id: "dave", email: "d@test.local", createdAt: new Date() });
    await expect(handler.markAllNotificationsRead({ orgId: "org-n" }, asUser("dave"))).rejects.toThrow();
  });
});
