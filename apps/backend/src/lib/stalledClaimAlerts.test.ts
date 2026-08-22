import { describe, it, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import { runStalledClaimAlertSweep, DIGEST_TASK_LIMIT } from "./stalledClaimAlerts";
import type { Mailer, MailMessage, SendOutcome } from "./mailer";
import { extractActor } from "../consumers/auditProjector";

/**
 * M25-T04 (ADR-0022). Fixtures are direct row inserts against the sqlite
 * schema, the same convention `stalledClaims.test.ts`/
 * `resolveTaskAlertRecipients.test.ts` use. `mailer` is always a hand-built
 * `Mailer` recording what it was asked to send - never `createMailer` with a
 * real transport, so no test opens a socket.
 */

const HOUR = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

function fakeMailer(): { mailer: Mailer; sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    enabled: true,
    appUrl: "https://tasker.example.com",
    send: async (message: MailMessage) => {
      sent.push(message);
      return "sent" as SendOutcome;
    },
  };
  return { mailer, sent };
}

function disabledMailer(): Mailer {
  return { enabled: false, appUrl: "https://tasker.example.com", send: async () => "skipped" as SendOutcome };
}

async function seedOrg(db: any, suffix: string) {
  const orgId = `org-${suffix}`;
  const userId = `user-${suffix}`;
  const templateId = `tmpl-${suffix}`;
  const roleId = `role-${suffix}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: new Date() });
  // Every seedOrg fixture has an admin, so the "no recipients at all" test
  // deliberately builds its own org from scratch rather than reusing this.
  await db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: new Date() });
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "Builder", systemPrompt: "s", capabilities: "[]", createdAt: new Date() });
  return { orgId, userId, templateId, roleId };
}

async function seedProject(db: any, base: { orgId: string; userId: string; templateId: string }, suffix: string) {
  const projectId = `proj-${suffix}`;
  await db.insert(schema.projects).values({
    id: projectId, orgId: base.orgId, templateId: base.templateId, name: "P",
    key: suffix.slice(0, 10), ownerId: base.userId, createdAt: new Date(),
  });
  return projectId;
}

async function seedAgent(db: any, base: { orgId: string; roleId: string }, suffix: string, name = `Agent-${suffix}`) {
  const agentId = `agt-${suffix}`;
  await db.insert(schema.agents).values({ id: agentId, orgId: base.orgId, agentRoleId: base.roleId, name, createdAt: new Date() });
  return agentId;
}

async function seedTask(db: any, projectId: string, suffix: string, opts: { createdAt?: Date } = {}) {
  const taskId = `tsk-${suffix}`;
  await db.insert(schema.tasks).values({
    id: taskId, projectId, displayId: `T-${suffix}`, title: `Task ${suffix}`,
    status: "todo", createdAt: opts.createdAt ?? new Date(),
  });
  return taskId;
}

async function seedHold(db: any, taskId: string, agentId: string) {
  await db.insert(schema.taskAssignments).values({ id: `ta-${crypto.randomUUID()}`, taskId, agentId, userId: null });
}

async function recordActivity(
  db: any,
  args: { taskId: string; projectId: string; kind: string; occurredAt: Date; actorId?: string | null; assigneeAgentId?: string | null },
) {
  await db.insert(schema.taskActivity).values({
    id: `act-${crypto.randomUUID()}`,
    taskId: args.taskId,
    projectId: args.projectId,
    kind: args.kind,
    actorType: "agent",
    actorId: args.actorId ?? null,
    assigneeAgentId: args.assigneeAgentId ?? null,
    occurredAt: args.occurredAt,
  });
}

async function seedUser(db: any, suffix: string, opts: { email?: string | null; name?: string | null } = {}) {
  const userId = `user-${suffix}`;
  await db.insert(schema.users).values({
    id: userId,
    email: opts.email === undefined ? `${userId}@test.local` : opts.email,
    name: opts.name === undefined ? `User ${suffix}` : opts.name,
    createdAt: new Date(),
  });
  return userId;
}

async function seedReviewer(db: any, taskId: string, userId: string) {
  await db.insert(schema.taskReviewers).values({ id: `rev-${crypto.randomUUID()}`, taskId, userId });
}

async function alertRowsFor(db: any, taskId: string) {
  return db.select().from(schema.stalledClaimAlerts).where(eq(schema.stalledClaimAlerts.taskId, taskId));
}

// ── exit criterion 1: digest-per-recipient, capped, +N more ────────────────

describe("runStalledClaimAlertSweep - digest assembly", () => {
  it("emails exactly two recipients, each digest itemizing only that recipient's own tasks", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d1");
    const projectId = await seedProject(db, base, "d1");
    const agentId = await seedAgent(db, base, "d1");
    const revA = await seedUser(db, "d1-revA", { email: "a@test.local", name: "Ann" });
    const revB = await seedUser(db, "d1-revB", { email: "b@test.local", name: "Bo" });

    const taskA = await seedTask(db, projectId, "d1-a");
    await seedHold(db, taskA, agentId);
    await recordActivity(db, { taskId: taskA, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskA, revA);

    const taskB = await seedTask(db, projectId, "d1-b");
    await seedHold(db, taskB, agentId);
    await recordActivity(db, { taskId: taskB, projectId, kind: "claimed", occurredAt: ago(28 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskB, revB);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent).toHaveLength(2);
    const byRecipient = new Map(sent.map((m) => [m.to, m]));
    expect(byRecipient.get("a@test.local")!.text).toContain("T-d1-a");
    expect(byRecipient.get("a@test.local")!.text).not.toContain("T-d1-b");
    expect(byRecipient.get("b@test.local")!.text).toContain("T-d1-b");
    expect(byRecipient.get("b@test.local")!.text).not.toContain("T-d1-a");
  });

  it("a task with two reviewers lands in both of their digests", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d2");
    const projectId = await seedProject(db, base, "d2");
    const agentId = await seedAgent(db, base, "d2");
    const revA = await seedUser(db, "d2-revA", { email: "a2@test.local" });
    const revB = await seedUser(db, "d2-revB", { email: "b2@test.local" });
    const taskId = await seedTask(db, projectId, "d2");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, revA);
    await seedReviewer(db, taskId, revB);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent).toHaveLength(2);
    expect(sent.every((m) => m.text.includes("T-d2"))).toBe(true);
    expect(sent.map((m) => m.to).sort()).toEqual(["a2@test.local", "b2@test.local"]);
  });

  it(`caps a recipient's digest at DIGEST_TASK_LIMIT (${DIGEST_TASK_LIMIT}) with an accurate "+N more" overflow, and only records/publishes the itemized tasks`, async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d3");
    const projectId = await seedProject(db, base, "d3");
    const agentId = await seedAgent(db, base, "d3");
    const rev = await seedUser(db, "d3-rev", { email: "rev3@test.local" });

    const total = DIGEST_TASK_LIMIT + 3;
    for (let i = 0; i < total; i++) {
      const taskId = await seedTask(db, projectId, `d3-${i}`);
      await seedHold(db, taskId, agentId);
      await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago((25 + i) * HOUR), actorId: agentId, assigneeAgentId: agentId });
      await seedReviewer(db, taskId, rev);
    }

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("3 more");

    // Only what was actually itemized is recorded as alerted - overflow
    // stays eligible for a later sweep (ADR-0022 Decision 2).
    const allAlertRows = await db.select().from(schema.stalledClaimAlerts);
    expect(allAlertRows).toHaveLength(DIGEST_TASK_LIMIT);
  });
});

// ── exit criterion 2 & 3: dedup by anchor, including the pre-collection case ─

describe("runStalledClaimAlertSweep - dedup", () => {
  it("re-running immediately with no state change sends zero further emails", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d4");
    const projectId = await seedProject(db, base, "d4");
    const agentId = await seedAgent(db, base, "d4");
    const rev = await seedUser(db, "d4-rev", { email: "rev4@test.local" });
    const taskId = await seedTask(db, projectId, "d4");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(1);

    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(1);
  });

  it("a task unassigned and reclaimed gets a new anchor and becomes eligible again", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d5");
    const projectId = await seedProject(db, base, "d5");
    const agentId = await seedAgent(db, base, "d5");
    const rev = await seedUser(db, "d5-rev", { email: "rev5@test.local" });
    const taskId = await seedTask(db, projectId, "d5");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(40 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(1);

    // Real activity, not a hand-crafted shortcut: unassign, then a fresh
    // claim - both still old enough (>24h) to qualify again, at a
    // genuinely different anchor than the first claim's.
    await recordActivity(db, { taskId, projectId, kind: "unassigned", occurredAt: ago(28 * HOUR), actorId: agentId });
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(26 * HOUR), actorId: agentId, assigneeAgentId: agentId });

    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(2);

    const rows = await alertRowsFor(db, taskId);
    expect(rows).toHaveLength(2);
  });

  it("a claim predating activity collection (no claimed/assigned row, only created) still dedupes correctly on its second sweep", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d6");
    const projectId = await seedProject(db, base, "d6");
    const agentId = await seedAgent(db, base, "d6");
    const rev = await seedUser(db, "d6-rev", { email: "rev6@test.local" });
    // No activity rows at all - the exact case the NOT NULL anchor fix
    // (T02/T03) exists for. Only the hold and the task's own backdated
    // createdAt.
    const taskId = await seedTask(db, projectId, "d6", { createdAt: ago(40 * HOUR) });
    await seedHold(db, taskId, agentId);
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(1);

    await runStalledClaimAlertSweep(db, true, mailer, nc);
    expect(sent).toHaveLength(1); // dedup held even with no claimed/assigned row to anchor on

    const rows = await alertRowsFor(db, taskId);
    expect(rows).toHaveLength(1);
  });
});

// ── exit criterion 4: recipient resolution + reason, and the zero-recipient case ─

describe("runStalledClaimAlertSweep - recipient resolution", () => {
  it("a task with reviewers is emailed with reason: reviewer and matching copy", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d7");
    const projectId = await seedProject(db, base, "d7");
    const agentId = await seedAgent(db, base, "d7");
    const rev = await seedUser(db, "d7-rev", { email: "rev7@test.local" });
    const taskId = await seedTask(db, projectId, "d7");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain(`you review T-d7`);
  });

  it("a task with no reviewers, in an org with an owner/admin, falls back to reason: admin", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d8"); // seedOrg's own user is an org admin
    const projectId = await seedProject(db, base, "d8");
    const agentId = await seedAgent(db, base, "d8");
    const taskId = await seedTask(db, projectId, "d8");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    // Deliberately no seedReviewer call.

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(`${base.userId}@test.local`);
    expect(sent[0]!.text).toContain("no reviewer assigned");
  });

  it("a task with neither reviewers nor org owners/admins resolves zero recipients and the sweep does not crash", async () => {
    const { db, nc } = await setupIntegrationTest();
    const orgId = "org-d9";
    const userId = "user-d9-member";
    const templateId = "tmpl-d9";
    const roleId = "role-d9";
    await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
    await db.insert(schema.users).values({ id: userId, email: "member9@test.local", createdAt: new Date() });
    // Only a plain member - no owner/admin anywhere in this org.
    await db.insert(schema.organizationMembers).values({ orgId, userId, role: "member", joinedAt: new Date() });
    await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
    await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "Builder", systemPrompt: "s", capabilities: "[]", createdAt: new Date() });
    const projectId = await seedProject(db, { orgId, userId, templateId }, "d9");
    const agentId = await seedAgent(db, { orgId, roleId }, "d9");
    const taskId = await seedTask(db, projectId, "d9");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });

    const { mailer, sent } = fakeMailer();
    await expect(runStalledClaimAlertSweep(db, true, mailer, nc)).resolves.toBeUndefined();

    expect(sent).toHaveLength(0);
    // Nothing was sent, so nothing may be marked alerted either.
    const rows = await alertRowsFor(db, taskId);
    expect(rows).toHaveLength(0);
  });
});

// ── exit criterion 5: !mailer.enabled short-circuits before any query ──────

describe("runStalledClaimAlertSweep - disabled mailer", () => {
  it("never touches the database when mailer.enabled is false", async () => {
    const throwingDb: any = new Proxy(
      {},
      { get() { throw new Error("db must not be queried when the mailer is disabled"); } },
    );
    await expect(runStalledClaimAlertSweep(throwingDb, true, disabledMailer(), null)).resolves.toBeUndefined();
  });
});

// ── exit criterion 8: the domain event payload shape ────────────────────────

describe("runStalledClaimAlertSweep - domain event", () => {
  it("publishes domain.task.stalled with stalledAgentId, and no agentId key at all", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d10");
    const projectId = await seedProject(db, base, "d10");
    const agentId = await seedAgent(db, base, "d10");
    const rev = await seedUser(db, "d10-rev", { email: "rev10@test.local" });
    const taskId = await seedTask(db, projectId, "d10");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    const published = nc.publishedMessages.filter((m: any) => m.subject === "domain.task.stalled");
    expect(published).toHaveLength(1);
    const payload = published[0]!.data as any;

    expect(payload.orgId).toBe(base.orgId);
    expect(payload.projectId).toBe(projectId);
    expect(payload.taskId).toBe(taskId);
    expect(payload.stalledAgentId).toBe(agentId);
    expect(typeof payload.hoursSilent).toBe("number");
    expect(Object.keys(payload).sort()).toEqual(["hoursSilent", "orgId", "projectId", "stalledAgentId", "taskId"]);
    expect("agentId" in payload).toBe(false);
  });

  it("that exact payload shape resolves actorType: system via auditProjector's extractActor", () => {
    const payload = { orgId: "org-1", projectId: "proj-1", taskId: "tsk-1", stalledAgentId: "agt-1", hoursSilent: 30 };
    expect(extractActor(payload)).toEqual({ actorType: "system", actorId: null });
  });
});

// ── exit criterion 10: independently configurable threshold ────────────────

describe("runStalledClaimAlertSweep - STALLED_ALERT_AFTER_HOURS", () => {
  it("produces a different alert boundary than the report panel's own default, for the same fixture", async () => {
    // Default threshold (STALLED_AFTER_HOURS = 24h): a 30h-silent claim qualifies.
    const { db: dbDefault, nc: ncDefault } = await setupIntegrationTest();
    const baseDefault = await seedOrg(dbDefault, "d11a");
    const projectDefault = await seedProject(dbDefault, baseDefault, "d11a");
    const agentDefault = await seedAgent(dbDefault, baseDefault, "d11a");
    const revDefault = await seedUser(dbDefault, "d11a-rev", { email: "rev11a@test.local" });
    const taskDefault = await seedTask(dbDefault, projectDefault, "d11a");
    await seedHold(dbDefault, taskDefault, agentDefault);
    await recordActivity(dbDefault, {
      taskId: taskDefault, projectId: projectDefault, kind: "claimed",
      occurredAt: ago(30 * HOUR), actorId: agentDefault, assigneeAgentId: agentDefault,
    });
    await seedReviewer(dbDefault, taskDefault, revDefault);

    const { mailer: mailerDefault, sent: sentDefault } = fakeMailer();
    await runStalledClaimAlertSweep(dbDefault, true, mailerDefault, ncDefault);
    expect(sentDefault).toHaveLength(1);

    // Same 30h-silent fixture, but STALLED_ALERT_AFTER_HOURS overridden to
    // 48h - stricter than the 30h silence, so this one must NOT fire, even
    // though the report panel's own default (24h) would.
    const original = process.env.STALLED_ALERT_AFTER_HOURS;
    process.env.STALLED_ALERT_AFTER_HOURS = "48";
    try {
      const { db: dbOverride, nc: ncOverride } = await setupIntegrationTest();
      const baseOverride = await seedOrg(dbOverride, "d11b");
      const projectOverride = await seedProject(dbOverride, baseOverride, "d11b");
      const agentOverride = await seedAgent(dbOverride, baseOverride, "d11b");
      const revOverride = await seedUser(dbOverride, "d11b-rev", { email: "rev11b@test.local" });
      const taskOverride = await seedTask(dbOverride, projectOverride, "d11b");
      await seedHold(dbOverride, taskOverride, agentOverride);
      await recordActivity(dbOverride, {
        taskId: taskOverride, projectId: projectOverride, kind: "claimed",
        occurredAt: ago(30 * HOUR), actorId: agentOverride, assigneeAgentId: agentOverride,
      });
      await seedReviewer(dbOverride, taskOverride, revOverride);

      const { mailer: mailerOverride, sent: sentOverride } = fakeMailer();
      await runStalledClaimAlertSweep(dbOverride, true, mailerOverride, ncOverride);
      expect(sentOverride).toHaveLength(0);
    } finally {
      if (original === undefined) delete process.env.STALLED_ALERT_AFTER_HOURS;
      else process.env.STALLED_ALERT_AFTER_HOURS = original;
    }
  });
});

// ── copy guidance + null-nc handling ─────────────────────────────────────────

describe("runStalledClaimAlertSweep - misc", () => {
  it("includes the unassign/reassign-not-comment guidance in the sent digest", async () => {
    const { db, nc } = await setupIntegrationTest();
    const base = await seedOrg(db, "d12");
    const projectId = await seedProject(db, base, "d12");
    const agentId = await seedAgent(db, base, "d12");
    const rev = await seedUser(db, "d12-rev", { email: "rev12@test.local" });
    const taskId = await seedTask(db, projectId, "d12");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await runStalledClaimAlertSweep(db, true, mailer, nc);

    expect(sent[0]!.text).toMatch(/unassign|reassign/i);
    expect(sent[0]!.text).toContain("read as new");
  });

  it("completes without throwing when nc is null (no broker attached)", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "d13");
    const projectId = await seedProject(db, base, "d13");
    const agentId = await seedAgent(db, base, "d13");
    const rev = await seedUser(db, "d13-rev", { email: "rev13@test.local" });
    const taskId = await seedTask(db, projectId, "d13");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await seedReviewer(db, taskId, rev);

    const { mailer, sent } = fakeMailer();
    await expect(runStalledClaimAlertSweep(db, true, mailer, null)).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });
});
