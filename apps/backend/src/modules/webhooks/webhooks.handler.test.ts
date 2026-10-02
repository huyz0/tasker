import { describe, it, expect, beforeEach } from "bun:test";
import { Code } from "@connectrpc/connect";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { decryptToken } from "../../lib/crypto";
import { createWebhooksHandler } from "./webhooks.handler";
import type { Resolver } from "./urlSafety";

/** M37-T02 (ADR-0030): managing webhooks is an org admin's job, and the secret is shown once. */
const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("WebhookService (M37-T02)", () => {
  let db: any, nc: any, handler: any, changes: number;
  let orgId: string, adminId: string, memberId: string, projectId: string, stamp: string;
  let admin: any;

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-wh-" + stamp;
    adminId = "user-wh-" + stamp;
    memberId = "member-wh-" + stamp;
    projectId = "proj-wh-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "WH Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-wh-" + stamp, projectId, name: "P" });
    await db.insert(schemaSqlite.users).values({ id: memberId, createdAt: new Date() });
    await db.insert(schemaSqlite.organizationMembers).values({ orgId, userId: memberId, role: "member", joinedAt: new Date() });
    changes = 0;
    handler = createWebhooksHandler(db, nc, { resolve: publicDns, allowPrivate: false, onChange: () => changes++ });
    admin = makeAuthContext(adminId);
  });

  async function expectCode(p: Promise<unknown>, code: Code, message?: RegExp) {
    const err: any = await p.then(() => null, (e) => e);
    expect(err?.code).toBe(code);
    if (message) expect(err.message).toMatch(message);
  }
  const create = (extra: Record<string, unknown> = {}) =>
    handler.createWebhook({ orgId, url: "https://hooks.example.com/tasker", events: ["task.*", "task.created"], description: "runner", ...extra }, admin);

  it("creates a webhook, returns the secret once, and stores it only encrypted", async () => {
    const res = await create();
    expect(res.secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(res.webhook).toMatchObject({ orgId, url: "https://hooks.example.com/tasker", events: ["task.*", "task.created"], active: true, consecutiveFailures: 0 });
    expect(res.webhook).not.toHaveProperty("secret");
    const [row] = await db.select().from(schemaSqlite.webhooks).where(eq(schemaSqlite.webhooks.id, res.webhook.id));
    expect(row.secretEncrypted).not.toContain(res.secret);
    expect(decryptToken(row.secretEncrypted)).toBe(res.secret);
    expect(changes).toBe(1);
    // Never again: the list carries no secret.
    const listed = (await handler.listWebhooks({ orgId }, admin)).webhooks;
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(res.secret);
  });

  it("refuses unsafe URLs, unknown events and a project from elsewhere", async () => {
    await expectCode(create({ url: "http://hooks.example.com/" }), Code.InvalidArgument, /https/);
    await expectCode(create({ url: "https://10.0.0.1/" }), Code.InvalidArgument, /non-public/);
    await expectCode(create({ events: [] }), Code.InvalidArgument, /at least one/);
    await expectCode(create({ events: ["task.exploded"] }), Code.InvalidArgument, /unknown event "task.exploded"/);
    await expectCode(create({ events: ["memory.*"] }), Code.InvalidArgument, /unknown event/);
    await expectCode(create({ projectId: "proj-elsewhere" }), Code.InvalidArgument, /not a project of this organization/);
    expect((await create({ projectId, events: ["*"] })).webhook.projectId).toBe(projectId);
  });

  it("is for organization admins only", async () => {
    const member = makeAuthContext(memberId);
    const { webhook } = await create();
    await expectCode(handler.createWebhook({ orgId, url: "https://hooks.example.com/x", events: ["*"] }, member), Code.PermissionDenied);
    await expectCode(handler.listWebhooks({ orgId }, member), Code.PermissionDenied);
    await expectCode(handler.rotateWebhookSecret({ id: webhook.id }, member), Code.PermissionDenied);

    // An admin of another organization cannot touch this one's webhooks.
    const otherOrg = "org-wh2-" + stamp;
    await seedOrgWithAdmin(db, { orgId: otherOrg, userId: "user-wh2-" + stamp, name: "Other" });
    const outsider = makeAuthContext("user-wh2-" + stamp);
    await expectCode(handler.deleteWebhook({ id: webhook.id }, outsider), Code.PermissionDenied);
    await expectCode(handler.listWebhookDeliveries({ webhookId: webhook.id }, outsider), Code.PermissionDenied);
    await expectCode(handler.updateWebhook({ id: "wh-missing", active: false }, admin), Code.NotFound);
  });

  it("updates url, events and description, and re-enabling clears the failure record", async () => {
    const { webhook } = await create();
    await db.update(schemaSqlite.webhooks).set({ active: false, consecutiveFailures: 20, disabledReason: "20 failures" }).where(eq(schemaSqlite.webhooks.id, webhook.id));

    const updated = (await handler.updateWebhook({ id: webhook.id, url: "https://hooks.example.com/v2", events: ["tasknote.*"], description: "v2", active: true }, admin)).webhook;
    expect(updated).toMatchObject({ url: "https://hooks.example.com/v2", events: ["tasknote.*"], description: "v2", active: true, consecutiveFailures: 0 });
    expect(updated).not.toHaveProperty("disabledReason");
    // An empty events list leaves the filter alone; a bad URL is refused.
    expect((await handler.updateWebhook({ id: webhook.id, events: [] }, admin)).webhook.events).toEqual(["tasknote.*"]);
    await expectCode(handler.updateWebhook({ id: webhook.id, url: "https://169.254.169.254/" }, admin), Code.InvalidArgument);
    // Pausing keeps the history.
    expect((await handler.updateWebhook({ id: webhook.id, active: false }, admin)).webhook.active).toBe(false);
  });

  it("rotates the secret, pings, lists deliveries, and deletes with its deliveries", async () => {
    const { webhook, secret } = await create();
    const rotated = (await handler.rotateWebhookSecret({ id: webhook.id }, admin)).secret;
    expect(rotated).not.toBe(secret);
    const [row] = await db.select().from(schemaSqlite.webhooks).where(eq(schemaSqlite.webhooks.id, webhook.id));
    expect(decryptToken(row.secretEncrypted)).toBe(rotated);

    const ping = (await handler.pingWebhook({ id: webhook.id }, admin)).delivery;
    expect(ping).toMatchObject({ webhookId: webhook.id, eventType: "ping", status: "pending", attempts: 0 });
    expect(ping.nextAttemptAt).toBeDefined();
    const [stored] = await db.select().from(schemaSqlite.webhookDeliveries).where(eq(schemaSqlite.webhookDeliveries.id, ping.id));
    expect(JSON.parse(stored.payload)).toMatchObject({ type: "ping", orgId, data: { webhookId: webhook.id } });

    const listed = await handler.listWebhookDeliveries({ webhookId: webhook.id }, admin);
    expect(listed.deliveries.map((d: any) => d.id)).toEqual([ping.id]);
    expect(listed.deliveries[0]).not.toHaveProperty("payload");
    expect(listed.page.totalCount).toBe(1);

    await handler.deleteWebhook({ id: webhook.id }, admin);
    expect(await db.select().from(schemaSqlite.webhookDeliveries).where(eq(schemaSqlite.webhookDeliveries.webhookId, webhook.id))).toEqual([]);
    expect((await handler.listWebhooks({ orgId }, admin)).webhooks).toEqual([]);
  });

  it("publishes management events without the URL", async () => {
    nc.clear();
    await create({ url: "https://hooks.example.com/x?token=secret-in-query" });
    const created = nc.publishedMessages.find((m: any) => m.subject === "domain.webhook.created");
    expect(created).toBeDefined();
    expect(JSON.stringify(created.data)).not.toContain("secret-in-query");
  });
});
