import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { setDomainEventSink } from "../../lib/natsCorrelation";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
import { createWebhooksHandler } from "./webhooks.handler";
import { createWebhookSink, ORG_CACHE_TTL_MS } from "./outbox";
import { runWebhookSweep, httpSender, backoffMs, MAX_ATTEMPTS, DISABLE_AFTER_FAILURES, type Sender } from "./delivery";
import type { Resolver } from "./urlSafety";

/** M37-T04 (ADR-0030): from a published event to a signed POST, and what happens when the receiver fails. */
const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const S = schemaSqlite;

describe("webhook outbox and delivery (M37-T04)", () => {
  let db: any, nc: any, tasks: any, hooks: any, admin: any;
  let orgId: string, projectId: string, otherProjectId: string, adminId: string, stamp: string;
  let clock: number;
  const now = () => clock;

  beforeEach(async () => {
    ({ db, nc } = await setupIntegrationTest());
    stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    orgId = "org-wd-" + stamp;
    adminId = "user-wd-" + stamp;
    projectId = "proj-wd-" + stamp;
    otherProjectId = "proj-wd2-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "WD Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-wd-" + stamp, projectId, name: "P" });
    await db.insert(S.projects).values({ id: otherProjectId, orgId, templateId: "tmpl-wd-" + stamp, ownerId: adminId, name: "P2", key: "WDTWO", createdAt: new Date() });
    admin = makeAuthContext(adminId);
    tasks = createTaskManagementHandler(db, nc);
    hooks = createWebhooksHandler(db, nc, { resolve: publicDns, allowPrivate: false });
    clock = Date.now();
  });

  afterEach(() => setDomainEventSink(null));

  const webhook = async (extra: Record<string, unknown> = {}) =>
    hooks.createWebhook({ orgId, url: "https://hooks.example.com/in", events: ["task.*"], ...extra }, admin);
  const deliveriesOf = (webhookId: string) => db.select().from(S.webhookDeliveries).where(eq(S.webhookDeliveries.webhookId, webhookId));

  describe("the sink", () => {
    it("queues one delivery per active, matching webhook in the event's organization and project", async () => {
      const sink = createWebhookSink(db, true, (e) => { throw e; }, now);
      const all = (await webhook()).webhook;
      const notesOnly = (await webhook({ events: ["tasknote.*"] })).webhook;
      const thisProject = (await webhook({ events: ["task.created"], projectId })).webhook;
      const otherProject = (await webhook({ events: ["*"], projectId: otherProjectId })).webhook;
      const paused = (await webhook({ events: ["*"] })).webhook;
      await hooks.updateWebhook({ id: paused.id, active: false }, admin);
      await seedOrgWithAdmin(db, { orgId: "org-wd3-" + stamp, userId: "user-wd3-" + stamp });
      const foreignHooks = createWebhooksHandler(db, nc, { resolve: publicDns, allowPrivate: false });
      const foreign = (await foreignHooks.createWebhook({ orgId: "org-wd3-" + stamp, url: "https://hooks.example.com/f", events: ["*"] }, makeAuthContext("user-wd3-" + stamp))).webhook;

      const task = (await tasks.createTask({ projectId, title: "T", status: "todo", description: "" }, admin)).task;
      expect(await sink.enqueue("domain.task.created", task)).toBe(2);
      expect((await deliveriesOf(all.id)).map((d: any) => d.eventType)).toEqual(["task.created"]);
      expect(await deliveriesOf(thisProject.id)).toHaveLength(1);
      for (const w of [notesOnly, otherProject, paused, foreign]) expect(await deliveriesOf(w.id)).toEqual([]);

      // A claim carries only the task id; the sink finds its project itself.
      expect(await sink.enqueue("domain.task.claimed", { taskId: task.id, agentId: "a" })).toBe(1);
      const [, claimed] = await deliveriesOf(all.id);
      const body = JSON.parse(claimed.payload);
      expect(body).toMatchObject({ type: "task.claimed", orgId, projectId, data: { taskId: task.id } });
      expect(body.id).toBe(claimed.eventId);

      // Not a task event, or nothing to place it by: nothing queued.
      expect(await sink.enqueue("domain.webhook.created", { orgId })).toBe(0);
      expect(await sink.enqueue("domain.task.purged", { taskId: "tsk-gone" })).toBe(0);
    });

    it("costs nothing when no organization has a webhook, and notices a new one on invalidate or after its TTL", async () => {
      const sink = createWebhookSink(db, true, (e) => { throw e; }, now);
      const task = (await tasks.createTask({ projectId, title: "T", status: "todo", description: "" }, admin)).task;
      expect(await sink.enqueue("domain.task.created", task)).toBe(0); // caches "no webhooks anywhere"
      await webhook();
      expect(await sink.enqueue("domain.task.created", task)).toBe(0); // stale cache, by design
      sink.invalidate();
      expect(await sink.enqueue("domain.task.created", task)).toBe(1);

      const sink2 = createWebhookSink(db, true, (e) => { throw e; }, now);
      await db.delete(S.webhooks);
      expect(await sink2.enqueue("domain.task.created", task)).toBe(0);
      await webhook();
      clock += ORG_CACHE_TTL_MS + 1;
      expect(await sink2.enqueue("domain.task.created", task)).toBe(1);
    });

    it("is fed by publishDomainEvent, so a task created through the API queues its delivery", async () => {
      const sink = createWebhookSink(db, true, (e) => { throw e; }, now);
      setDomainEventSink(sink.publish);
      const { webhook: w } = await webhook();
      sink.invalidate();
      await tasks.createTask({ projectId, title: "Via the API", status: "todo", description: "" }, admin);
      for (let i = 0; i < 50 && (await deliveriesOf(w.id)).length === 0; i++) await new Promise((r) => setTimeout(r, 10));
      const [d] = await deliveriesOf(w.id);
      expect(JSON.parse(d.payload).data.title).toBe("Via the API");
    });
  });

  describe("the sweep", () => {
    const recordingSender = (status: number | (() => number)) => {
      const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
      const send: Sender = async (url, body, headers) => {
        sent.push({ url, body, headers });
        return { status: typeof status === "function" ? status() : status };
      };
      return { sent, send };
    };

    it("delivers a signed POST a receiver can verify, and records it", async () => {
      const { webhook: w, secret } = await webhook();
      const { delivery } = await hooks.pingWebhook({ id: w.id }, admin);
      const { sent, send } = recordingSender(204);
      expect(await runWebhookSweep(db, true, { send, now })).toMatchObject({ delivered: 1 });

      expect(sent).toHaveLength(1);
      const { url, body, headers } = sent[0]!;
      expect(url).toBe("https://hooks.example.com/in");
      expect(headers["x-tasker-event"]).toBe("ping");
      expect(headers["x-tasker-delivery"]).toBe(delivery.id);
      // Verified the way a receiver would: HMAC of "<timestamp>.<raw body>".
      const expected = createHmac("sha256", secret).update(`${headers["x-tasker-timestamp"]}.${body}`).digest("hex");
      expect(headers["x-tasker-signature"]).toBe(`sha256=${expected}`);

      const [row] = await deliveriesOf(w.id);
      expect(row).toMatchObject({ status: "delivered", attempts: 1, lastStatusCode: 204, claimedUntil: null });
      const [hook] = await db.select().from(S.webhooks).where(eq(S.webhooks.id, w.id));
      expect(hook.lastDeliveryAt).not.toBeNull();
      // Nothing left to do.
      expect(await runWebhookSweep(db, true, { send, now })).toEqual({ delivered: 0, retried: 0, failed: 0, disabled: 0 });
    });

    it("retries with backoff, then gives up after the last attempt", async () => {
      const { webhook: w } = await webhook();
      await hooks.pingWebhook({ id: w.id }, admin);
      const { sent, send } = recordingSender(503);
      expect(await runWebhookSweep(db, true, { send, now })).toMatchObject({ retried: 1 });
      let [row] = await deliveriesOf(w.id);
      expect(row).toMatchObject({ status: "pending", attempts: 1, lastStatusCode: 503, lastError: "receiver answered HTTP 503" });
      expect(row.nextAttemptAt.getTime()).toBe(Math.floor((clock + backoffMs(1)) / 1000) * 1000);
      // Not due yet: nothing is sent.
      await runWebhookSweep(db, true, { send, now });
      expect(sent).toHaveLength(1);

      for (let i = 2; i <= MAX_ATTEMPTS; i++) {
        clock += backoffMs(i - 1) + 1000;
        await runWebhookSweep(db, true, { send, now });
      }
      [row] = await deliveriesOf(w.id);
      expect(row).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
      expect(sent).toHaveLength(MAX_ATTEMPTS);
      expect([backoffMs(1), backoffMs(2), backoffMs(3)]).toEqual([30_000, 60_000, 120_000]);
    });

    it("records a transport failure, and a redirect is a failure, not followed", async () => {
      const { webhook: w } = await webhook();
      await hooks.pingWebhook({ id: w.id }, admin);
      await runWebhookSweep(db, true, { send: async () => { throw new Error("connect ECONNREFUSED"); }, now });
      expect((await deliveriesOf(w.id))[0]).toMatchObject({ status: "pending", lastError: "connect ECONNREFUSED", lastStatusCode: null });
      clock += backoffMs(1) + 1000;
      await runWebhookSweep(db, true, { send: async () => ({ status: 302 }), now });
      expect((await deliveriesOf(w.id))[0]).toMatchObject({ lastStatusCode: 302, lastError: "receiver answered HTTP 302" });
    });

    it("disables a webhook after consecutive failures and tells the org's admins; success resets the count", async () => {
      const { webhook: w } = await webhook();
      for (let i = 0; i < DISABLE_AFTER_FAILURES - 1; i++) await hooks.pingWebhook({ id: w.id }, admin);
      await runWebhookSweep(db, true, { send: recordingSender(500).send, now, batch: 100 });
      let [hook] = await db.select().from(S.webhooks).where(eq(S.webhooks.id, w.id));
      expect(hook).toMatchObject({ active: true, consecutiveFailures: DISABLE_AFTER_FAILURES - 1 });

      // One success clears the record...
      await hooks.pingWebhook({ id: w.id }, admin);
      clock += backoffMs(1) + 1000;
      await runWebhookSweep(db, true, { send: recordingSender(200).send, now, batch: 1 });
      [hook] = await db.select().from(S.webhooks).where(eq(S.webhooks.id, w.id));
      expect(hook.consecutiveFailures).toBe(0);

      // ...and a full run of failures switches it off, once.
      await db.delete(S.webhookDeliveries);
      for (let i = 0; i < DISABLE_AFTER_FAILURES + 2; i++) await hooks.pingWebhook({ id: w.id }, admin);
      const res = await runWebhookSweep(db, true, { send: recordingSender(500).send, now, batch: 100, concurrency: 1 });
      expect(res.disabled).toBe(1);
      [hook] = await db.select().from(S.webhooks).where(eq(S.webhooks.id, w.id));
      expect(hook.active).toBe(false);
      expect(hook.disabledReason).toContain(`${DISABLE_AFTER_FAILURES} consecutive failed deliveries`);
      // The two after it were not sent to a receiver that is switched off.
      expect((await deliveriesOf(w.id)).filter((d: any) => d.lastError === "webhook is not active")).toHaveLength(2);

      const notes = await db.select().from(S.notifications).where(eq(S.notifications.userId, adminId));
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: "webhook.disabled", title: "Webhook to hooks.example.com disabled" });
      expect(notes[0].targetPath).toBe(`/organizations?section=webhooks&org=${orgId}`);
    });

    it("never sends one delivery twice when sweeps overlap", async () => {
      const { webhook: w } = await webhook();
      for (let i = 0; i < 10; i++) await hooks.pingWebhook({ id: w.id }, admin);
      const { sent, send } = recordingSender(200);
      const slow: Sender = async (...args) => { await new Promise((r) => setTimeout(r, 5)); return send(...args); };
      await Promise.all([runWebhookSweep(db, true, { send: slow, now }), runWebhookSweep(db, true, { send: slow, now })]);
      expect(sent).toHaveLength(10);
      expect(new Set(sent.map((s) => s.headers["x-tasker-delivery"])).size).toBe(10);
    });

    it("prunes settled deliveries after a week, never pending ones", async () => {
      const { webhook: w } = await webhook();
      await hooks.pingWebhook({ id: w.id }, admin);
      await runWebhookSweep(db, true, { send: recordingSender(200).send, now });
      await hooks.pingWebhook({ id: w.id }, admin);
      clock += 8 * 24 * 60 * 60 * 1000;
      await db.update(S.webhookDeliveries).set({ nextAttemptAt: new Date(clock + 60_000) }).where(eq(S.webhookDeliveries.status, "pending"));
      await runWebhookSweep(db, true, { send: recordingSender(200).send, now });
      expect((await deliveriesOf(w.id)).map((d: any) => d.status)).toEqual(["pending"]);
    });
  });
});

describe("httpSender (M37-T04)", () => {
  let server: http.Server;
  let port = 0;
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];

  beforeEach(async () => {
    received.length = 0;
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        if (req.url === "/redirect") { res.writeHead(302, { location: "http://127.0.0.1/admin" }); return res.end(); }
        res.writeHead(204);
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterEach(() => server.close());

  it("posts the body and headers, and does not follow redirects", async () => {
    const send = httpSender(true);
    expect(await send(`http://127.0.0.1:${port}/hook`, '{"a":1}', { "x-tasker-event": "ping", "content-type": "application/json" })).toEqual({ status: 204 });
    expect(received[0]!.body).toBe('{"a":1}');
    expect(received[0]!.headers["x-tasker-event"]).toBe("ping");
    expect(received[0]!.headers["content-length"]).toBe("7");
    expect(await send(`http://127.0.0.1:${port}/redirect`, "{}", {})).toEqual({ status: 302 });
    expect(received).toHaveLength(2);
  });

  it("refuses a private literal, and a name that resolves privately, before any byte is sent", async () => {
    await expect(httpSender(false)(`http://127.0.0.1:${port}/hook`, "{}", {})).rejects.toThrow("non-public address 127.0.0.1");
    const rebinding: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    await expect(httpSender(false, rebinding)(`http://hooks.example.com:${port}/hook`, "{}", {})).rejects.toThrow(/non-public/);
    expect(received).toHaveLength(0);
  });
});
