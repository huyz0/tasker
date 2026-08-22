import { describe, it, expect } from "bun:test";
import { sql } from "drizzle-orm";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import { findStalledCandidates, buildHeldTaskQuery } from "./stalledClaims";

/**
 * M25-T03 (ADR-0022). This is a `lib/` unit test, not a handler test - every
 * fixture is a direct row insert against the sqlite schema (the same
 * convention `retentionSweep.test.ts`/`cascadePurge.test.ts` use), rather
 * than driving the real mutation RPCs the way `reports.test.ts` does. The
 * cases here mirror `reports.test.ts`'s `stalledClaims` describe block
 * exactly, since the whole point of the extraction is that both suites agree
 * on the same behavior; `reports.test.ts` itself is left untouched as the
 * regression guard for the project-scoped call shape.
 */

const HOUR = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms);

async function seedOrg(db: any, suffix: string) {
  const orgId = `org-${suffix}`;
  const userId = `user-${suffix}`;
  const templateId = `tmpl-${suffix}`;
  const roleId = `role-${suffix}`;
  const now = new Date();
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: now });
  await db.insert(schema.users).values({ id: userId, email: `${userId}@test.local`, createdAt: now });
  await db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: now });
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: now });
  await db.insert(schema.agentRoles).values({ id: roleId, orgId, name: "Builder", systemPrompt: "s", capabilities: "[]", createdAt: now });
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

async function seedTask(
  db: any,
  projectId: string,
  suffix: string,
  opts: { status?: string; taskTypeId?: string | null; createdAt?: Date } = {},
) {
  const taskId = `tsk-${suffix}`;
  await db.insert(schema.tasks).values({
    id: taskId, projectId, displayId: `T-${suffix}`, title: `Task ${suffix}`,
    status: opts.status ?? "todo", taskTypeId: opts.taskTypeId ?? null,
    createdAt: opts.createdAt ?? new Date(),
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

describe("findStalledCandidates - project-scoped", () => {
  it("a claim silent past the threshold surfaces as never-started, with the agent's last-seen badge", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p1");
    const projectId = await seedProject(db, base, "p1");
    const agentId = await seedAgent(db, base, "p1");
    const taskId = await seedTask(db, projectId, "p1");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });

    const lastUsed = ago(2 * HOUR);
    await db.insert(schema.apiTokens).values({
      id: `tok-${crypto.randomUUID()}`, orgId: base.orgId, agentId, name: "t", tokenPrefix: "tk",
      tokenHash: `h-${crypto.randomUUID()}`, scopes: "[]", createdBy: base.userId, createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * HOUR), lastUsedAt: lastUsed,
    });

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.taskId).toBe(taskId);
    expect(c.orgId).toBe(base.orgId);
    expect(c.agentId).toBe(agentId);
    expect(c.agentName).toBe(`Agent-p1`);
    expect(c.neverStarted).toBe(true);
    expect(c.claimedAt).toBeDefined();
    expect(Math.floor((c.agentLastSeenAt as Date).getTime() / 1000)).toBe(Math.floor(lastUsed.getTime() / 1000));
  });

  it("a claim that went quiet after working is stalled but not never-started", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p2");
    const projectId = await seedProject(db, base, "p2");
    const agentId = await seedAgent(db, base, "p2");
    const taskId = await seedTask(db, projectId, "p2");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await recordActivity(db, { taskId, projectId, kind: "note", occurredAt: ago(26 * HOUR), actorId: agentId });

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.neverStarted).toBe(false);
    expect(Math.abs((candidates[0]!.lastSignalAt as Date).getTime() - ago(26 * HOUR).getTime())).toBeLessThan(5000);
  });

  it("a fresh signal keeps a task off the list", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p3");
    const projectId = await seedProject(db, base, "p3");
    const agentId = await seedAgent(db, base, "p3");
    const taskId = await seedTask(db, projectId, "p3");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    await recordActivity(db, { taskId, projectId, kind: "comment", occurredAt: ago(1 * HOUR), actorId: agentId });

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(0);
  });

  it("a claim predating activity collection has no claimedAt, and still surfaces via createdAt", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p4");
    const projectId = await seedProject(db, base, "p4");
    const agentId = await seedAgent(db, base, "p4");
    // No 'claimed' row at all - only the hold itself and the task's own
    // (backdated) createdAt, the exact case the ADR's NOT-NULL anchor
    // reasoning names.
    const taskId = await seedTask(db, projectId, "p4", { createdAt: ago(30 * HOUR) });
    await seedHold(db, taskId, agentId);

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.claimedAt).toBeUndefined();
    expect(candidates[0]!.neverStarted).toBe(true);
  });

  it("excludes a terminal task, an unclaimed task, and a human-held task", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p5");
    const projectId = await seedProject(db, base, "p5");
    const agentId = await seedAgent(db, base, "p5");

    const done = await seedTask(db, projectId, "p5-done", { status: "done" });
    await seedHold(db, done, agentId);
    await recordActivity(db, { taskId: done, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });

    await seedTask(db, projectId, "p5-unheld"); // never assigned at all

    const humanHeld = await seedTask(db, projectId, "p5-human");
    await db.insert(schema.taskAssignments).values({ id: `ta-${crypto.randomUUID()}`, taskId: humanHeld, agentId: null, userId: base.userId });

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(0);
  });

  it("respects a typed status set's max-position tie for terminality (M24 edge case, re-proven at this boundary)", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p6");
    const projectId = await seedProject(db, base, "p6");
    const agentId = await seedAgent(db, base, "p6");
    const taskTypeId = `tt-p6`;
    await db.insert(schema.taskTypes).values({ id: taskTypeId, projectId, orgId: base.orgId, name: "TT", createdAt: new Date() });
    // Two statuses share the max position - both are terminal per M24's rule.
    await db.insert(schema.taskStatuses).values([
      { id: "st-p6-a", taskTypeId, name: "todo", position: 0 },
      { id: "st-p6-b", taskTypeId, name: "shipped", position: 1 },
      { id: "st-p6-c", taskTypeId, name: "cancelled", position: 1 },
    ]);
    const taskId = await seedTask(db, projectId, "p6", { status: "cancelled", taskTypeId });
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });

    const candidates = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(candidates).toHaveLength(0);
  });

  it("caps at a supplied limit, most-silent first", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "p7");
    const projectId = await seedProject(db, base, "p7");
    const agentId = await seedAgent(db, base, "p7");

    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const taskId = await seedTask(db, projectId, `p7-${i}`);
      await seedHold(db, taskId, agentId);
      await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago((25 + i) * HOUR), actorId: agentId, assigneeAgentId: agentId });
      ids.push(taskId);
    }

    const candidates = await findStalledCandidates(db, true, { projectId, limit: 3, afterHours: 24 });
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.taskId)).toEqual([...ids].reverse().slice(0, 3));
  });
});

describe("findStalledCandidates - global (no projectId)", () => {
  it("returns candidates across multiple projects/orgs with the right orgId each, sorted most-silent-first", async () => {
    const { db } = await setupIntegrationTest();
    const baseA = await seedOrg(db, "gA");
    const baseB = await seedOrg(db, "gB");
    const projectA = await seedProject(db, baseA, "gA");
    const projectB = await seedProject(db, baseB, "gB");
    const agentA = await seedAgent(db, baseA, "gA");
    const agentB = await seedAgent(db, baseB, "gB");

    const taskA = await seedTask(db, projectA, "gA");
    await seedHold(db, taskA, agentA);
    await recordActivity(db, { taskId: taskA, projectId: projectA, kind: "claimed", occurredAt: ago(48 * HOUR), actorId: agentA, assigneeAgentId: agentA });

    const taskB = await seedTask(db, projectB, "gB");
    await seedHold(db, taskB, agentB);
    await recordActivity(db, { taskId: taskB, projectId: projectB, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentB, assigneeAgentId: agentB });

    const candidates = await findStalledCandidates(db, true, { afterHours: 24 });
    expect(candidates).toHaveLength(2);
    // Most silent (taskA, 48h) first.
    expect(candidates.map((c) => c.taskId)).toEqual([taskA, taskB]);
    expect(candidates.find((c) => c.taskId === taskA)!.orgId).toBe(baseA.orgId);
    expect(candidates.find((c) => c.taskId === taskB)!.orgId).toBe(baseB.orgId);
  });

  it("caps the global result at a supplied limit too", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "gLimit");
    const projectId = await seedProject(db, base, "gLimit");
    const agentId = await seedAgent(db, base, "gLimit");

    for (let i = 1; i <= 4; i++) {
      const taskId = await seedTask(db, projectId, `gLimit-${i}`);
      await seedHold(db, taskId, agentId);
      await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago((25 + i) * HOUR), actorId: agentId, assigneeAgentId: agentId });
    }

    const candidates = await findStalledCandidates(db, true, { limit: 2, afterHours: 24 });
    expect(candidates).toHaveLength(2);
  });
});

describe("findStalledCandidates - global-scale query shape (exit criterion 6)", () => {
  it("plans the global held-task query against task_activity's indexes, not a full table scan", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "scaleA");
    const projectId = await seedProject(db, base, "scaleA");
    const agentId = await seedAgent(db, base, "scaleA");
    // A handful of real rows so the plan reflects real index selection, not
    // an empty-table shortcut.
    for (let i = 0; i < 5; i++) {
      const taskId = await seedTask(db, projectId, `scaleA-${i}`);
      await seedHold(db, taskId, agentId);
      await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago((25 + i) * HOUR), actorId: agentId, assigneeAgentId: agentId });
    }

    // Global query: no projectId, so (per the params-count test below) it
    // binds zero parameters - the plan can be read the same way
    // `indexCoverage.test.ts` reads its own hot queries, via `sql.raw`.
    const { sql: builtSql, params } = buildHeldTaskQuery(db, true, {}).toSQL();
    expect(params).toEqual([]);
    const planRows = await db.all(sql.raw(`EXPLAIN QUERY PLAN ${builtSql}`));
    const detail = planRows.map((r: any) => r.detail).join(" | ");
    // The join into task_activity must be a seek on its (task_id,
    // occurred_at) index, not a scan of the whole table - the exact
    // distinction `indexCoverage.test.ts` draws for every other hot query.
    expect(detail).not.toContain("SCAN task_activity");
    expect(detail).toContain("task_activity");
  });

  it("the built global query's parameter count does not grow with the number of held tasks (500+ fixture)", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "scaleB");
    const agentId = await seedAgent(db, base, "scaleB");

    // Spread across several projects, matching the milestone's "many
    // projects" framing rather than one giant project.
    const PROJECT_COUNT = 5;
    const TASKS_PER_PROJECT = 101; // 505 held tasks total.
    const projectIds: string[] = [];
    for (let p = 0; p < PROJECT_COUNT; p++) {
      projectIds.push(await seedProject(db, base, `scaleB-${p}`));
    }

    let total = 0;
    for (const projectId of projectIds) {
      for (let i = 0; i < TASKS_PER_PROJECT; i++) {
        const taskId = await seedTask(db, projectId, `scaleB-${projectId}-${i}`);
        await seedHold(db, taskId, agentId);
        await recordActivity(db, {
          taskId, projectId, kind: "claimed", occurredAt: ago((25 + (i % 20)) * HOUR),
          actorId: agentId, assigneeAgentId: agentId,
        });
        total++;
      }
    }
    expect(total).toBeGreaterThan(500);

    // Correctness at this size: every held, non-terminal, past-threshold task
    // comes back (afterHours: 24, and every claim above is aged 25h+).
    const candidates = await findStalledCandidates(db, true, { afterHours: 24 });
    expect(candidates.length).toBe(total);

    // The actual proof: the built query's bound parameter count is a small
    // constant, never a function of `total` - no IN-list of held task ids is
    // ever assembled, regardless of how many tasks are held.
    const { params } = buildHeldTaskQuery(db, true, {}).toSQL();
    expect(params.length).toBeLessThan(10);

    const { params: scopedParams } = buildHeldTaskQuery(db, true, { projectId: projectIds[0]! }).toSQL();
    expect(scopedParams.length).toBeLessThan(10);
  });
});

describe("findStalledCandidates - anchorAt/silentSince (M25-T04)", () => {
  it("exposes anchorAt as claimedAt when a claim row exists", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "anchor1");
    const projectId = await seedProject(db, base, "anchor1");
    const agentId = await seedAgent(db, base, "anchor1");
    const taskId = await seedTask(db, projectId, "anchor1");
    await seedHold(db, taskId, agentId);
    const claimedAt = ago(30 * HOUR);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: claimedAt, actorId: agentId, assigneeAgentId: agentId });

    const [c] = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(c!.anchorAt).toBeInstanceOf(Date);
    expect(Math.abs(c!.anchorAt.getTime() - claimedAt.getTime())).toBeLessThan(5000);
  });

  it("falls back anchorAt to the task's own createdAt for a claim predating activity collection - never undefined", async () => {
    // This is the exact NOT NULL case ADR-0022 Decision 3 exists for: no
    // claimed/assigned row at all, so `claimedAt` above is undefined but
    // `anchorAt` must not be - a dedup table keyed on a hole here is the bug
    // T02/T03 were built to close.
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "anchor2");
    const projectId = await seedProject(db, base, "anchor2");
    const agentId = await seedAgent(db, base, "anchor2");
    const createdAt = ago(30 * HOUR);
    const taskId = await seedTask(db, projectId, "anchor2", { createdAt });
    await seedHold(db, taskId, agentId);

    const [c] = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(c!.claimedAt).toBeUndefined();
    expect(c!.anchorAt).toBeInstanceOf(Date);
    expect(Math.abs(c!.anchorAt.getTime() - createdAt.getTime())).toBeLessThan(5000);
  });

  it("exposes silentSince matching the detector's own filter clock", async () => {
    const { db } = await setupIntegrationTest();
    const base = await seedOrg(db, "anchor3");
    const projectId = await seedProject(db, base, "anchor3");
    const agentId = await seedAgent(db, base, "anchor3");
    const taskId = await seedTask(db, projectId, "anchor3");
    await seedHold(db, taskId, agentId);
    await recordActivity(db, { taskId, projectId, kind: "claimed", occurredAt: ago(30 * HOUR), actorId: agentId, assigneeAgentId: agentId });
    const noteAt = ago(26 * HOUR);
    await recordActivity(db, { taskId, projectId, kind: "note", occurredAt: noteAt, actorId: agentId });

    const [c] = await findStalledCandidates(db, true, { projectId, afterHours: 24 });
    expect(Math.abs(c!.silentSince.getTime() - noteAt.getTime())).toBeLessThan(5000);
  });
});
