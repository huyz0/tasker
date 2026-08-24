import { describe, it, expect } from "bun:test";
import { setupIntegrationTest } from "../test/setup";
import * as schema from "../db/schema.sqlite";
import { resolveTaskAlertRecipients } from "./resolveTaskAlertRecipients";

/**
 * M25-T04 (ADR-0022 Decision 1). Fixtures are direct row inserts against the
 * sqlite schema, the same convention `stalledClaims.test.ts` uses.
 */

async function seedOrg(db: any, suffix: string) {
  const orgId = `org-${suffix}`;
  await db.insert(schema.organizations).values({ id: orgId, name: "Org", slug: orgId, createdAt: new Date() });
  return orgId;
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

async function seedMember(db: any, orgId: string, userId: string, role: string) {
  await db.insert(schema.organizationMembers).values({ orgId, userId, role, joinedAt: new Date() });
}

async function seedTask(db: any, projectId: string, suffix: string) {
  const taskId = `tsk-${suffix}`;
  await db.insert(schema.tasks).values({ id: taskId, projectId, displayId: `T-${suffix}`, title: "Task", status: "todo", createdAt: new Date() });
  return taskId;
}

async function seedProject(db: any, orgId: string, suffix: string, ownerId: string) {
  const templateId = `tmpl-${suffix}`;
  const projectId = `proj-${suffix}`;
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "T", createdAt: new Date() });
  await db.insert(schema.projects).values({ id: projectId, orgId, templateId, name: "P", key: suffix.slice(0, 10), ownerId, createdAt: new Date() });
  return projectId;
}

async function seedReviewer(db: any, taskId: string, userId: string) {
  await db.insert(schema.taskReviewers).values({ id: `rev-${crypto.randomUUID()}`, taskId, userId });
}

describe("resolveTaskAlertRecipients", () => {
  it("resolves the task's reviewers, tagged reason: reviewer", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r1");
    const owner = await seedUser(db, "r1-owner");
    const projectId = await seedProject(db, orgId, "r1", owner);
    const taskId = await seedTask(db, projectId, "r1");
    const reviewer = await seedUser(db, "r1-reviewer", { email: "reviewer@test.local", name: "Reviewer One" });
    await seedReviewer(db, taskId, reviewer);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients).toEqual([{ userId: reviewer, email: "reviewer@test.local", name: "Reviewer One", reason: "reviewer" }]);
  });

  it("falls back to org owner/admin members only when the task has no reviewers", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r2");
    const owner = await seedUser(db, "r2-owner", { email: "owner@test.local", name: "Owner" });
    const admin = await seedUser(db, "r2-admin", { email: "admin@test.local", name: "Admin" });
    const member = await seedUser(db, "r2-member", { email: "member@test.local", name: "Member" });
    await seedMember(db, orgId, owner, "owner");
    await seedMember(db, orgId, admin, "admin");
    await seedMember(db, orgId, member, "member");
    const projectId = await seedProject(db, orgId, "r2", owner);
    const taskId = await seedTask(db, projectId, "r2");

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    const emails = recipients.map((r) => r.email).sort();
    expect(emails).toEqual(["admin@test.local", "owner@test.local"]);
    expect(recipients.every((r) => r.reason === "admin")).toBe(true);
  });

  it("does not fall back to admins when at least one reviewer exists", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r3");
    const owner = await seedUser(db, "r3-owner", { email: "owner3@test.local" });
    await seedMember(db, orgId, owner, "owner");
    const projectId = await seedProject(db, orgId, "r3", owner);
    const taskId = await seedTask(db, projectId, "r3");
    const reviewer = await seedUser(db, "r3-reviewer", { email: "reviewer3@test.local" });
    await seedReviewer(db, taskId, reviewer);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients).toHaveLength(1);
    expect(recipients[0]!.email).toBe("reviewer3@test.local");
    expect(recipients[0]!.reason).toBe("reviewer");
  });

  // ── M29-T02: recipients are people, not addresses ──────────────────────
  //
  // M25 filtered this list to non-null email throughout, because email was
  // the only channel and "a person with no email has nowhere for this alert
  // to go" was true. M13 made email optional on purpose, so that filter
  // silently excluded local-account users from alerting entirely. The in-app
  // channel has no address to filter on, so resolution now returns the
  // person and the email channel filters at the point of sending.

  it("includes a reviewer with no email configured (M13 local accounts)", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r4");
    const owner = await seedUser(db, "r4-owner", { email: null });
    await seedMember(db, orgId, owner, "owner");
    const projectId = await seedProject(db, orgId, "r4", owner);
    const taskId = await seedTask(db, projectId, "r4");
    const noEmailReviewer = await seedUser(db, "r4-reviewer", { email: null });
    await seedReviewer(db, taskId, noEmailReviewer);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients).toHaveLength(1);
    expect(recipients[0]!.userId).toBe(noEmailReviewer);
    expect(recipients[0]!.email).toBeNull();
    expect(recipients[0]!.reason).toBe("reviewer");
  });

  it("names an email-less reviewer by their name rather than an address", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r4b");
    const owner = await seedUser(db, "r4b-owner", { email: "owner4b@test.local" });
    await seedMember(db, orgId, owner, "owner");
    const projectId = await seedProject(db, orgId, "r4b", owner);
    const taskId = await seedTask(db, projectId, "r4b");
    const rev = await seedUser(db, "r4b-rev", { email: null, name: "Local Only" });
    await seedReviewer(db, taskId, rev);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients[0]!.name).toBe("Local Only");
  });

  it("does NOT fall back to org admins when the only reviewer has no email", async () => {
    // The tier check used to run after the email filter, so an email-less
    // reviewer made the task look reviewer-less and the alert was routed to
    // every org owner/admin instead - both a missed notification and a
    // disclosure to people ADR-0022 Decision 1 says should not receive it.
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r4c");
    const admin = await seedUser(db, "r4c-admin", { email: "admin4c@test.local" });
    await seedMember(db, orgId, admin, "owner");
    const projectId = await seedProject(db, orgId, "r4c", admin);
    const taskId = await seedTask(db, projectId, "r4c");
    const rev = await seedUser(db, "r4c-rev", { email: null });
    await seedReviewer(db, taskId, rev);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients.map((r) => r.reason)).toEqual(["reviewer"]);
    expect(recipients.map((r) => r.userId)).toEqual([rev]);
  });

  it("includes an org admin with no email in the fallback tier", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r4d");
    const owner = await seedUser(db, "r4d-owner", { email: null });
    await seedMember(db, orgId, owner, "owner");
    const projectId = await seedProject(db, orgId, "r4d", owner);
    const taskId = await seedTask(db, projectId, "r4d");

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients).toHaveLength(1);
    expect(recipients[0]!.userId).toBe(owner);
    expect(recipients[0]!.reason).toBe("admin");
  });

  it("resolves zero recipients gracefully when a task has neither reviewers nor org owners/admins", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r5");
    const member = await seedUser(db, "r5-member", { email: "member5@test.local" });
    await seedMember(db, orgId, member, "member");
    const projectId = await seedProject(db, orgId, "r5", member);
    const taskId = await seedTask(db, projectId, "r5");

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients).toEqual([]);
  });

  it("resolves multiple reviewers, so one task can land in more than one digest", async () => {
    const { db } = await setupIntegrationTest();
    const orgId = await seedOrg(db, "r6");
    const owner = await seedUser(db, "r6-owner");
    const projectId = await seedProject(db, orgId, "r6", owner);
    const taskId = await seedTask(db, projectId, "r6");
    const rev1 = await seedUser(db, "r6-rev1", { email: "rev1@test.local" });
    const rev2 = await seedUser(db, "r6-rev2", { email: "rev2@test.local" });
    await seedReviewer(db, taskId, rev1);
    await seedReviewer(db, taskId, rev2);

    const recipients = await resolveTaskAlertRecipients(db, true, { taskId, orgId });
    expect(recipients.map((r) => r.email).sort()).toEqual(["rev1@test.local", "rev2@test.local"]);
  });
});
