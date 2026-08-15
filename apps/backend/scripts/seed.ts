// Seeds a realistic-scale local fixture set: an org, a project with several
// task types/statuses, a batch of tasks spread across statuses, a couple of
// agents, and some labels. Several pagination bugs found in earlier review
// rounds only showed up once a list had enough rows to actually paginate
// (see e.g. R9/R10's *-dashboard-pagination-cap findings) - a handful of
// manually-clicked-through fixtures never surfaces that class of bug.
//
// Run with: `bun run scripts/seed.ts` (from apps/backend). Talks directly to
// the DB layer (bypassing HTTP/auth) since this is a dev-only tool, not a
// user-facing feature. Prints a ready-to-use session token for the seeded
// user at the end.
import { setupDatabase } from "../src/db/db";
import * as schema from "../src/db/schema.sqlite";
import { createSessionToken } from "../src/modules/auth/session";

const TASK_COUNT = Number(process.env.SEED_TASK_COUNT) || 150;
// Must match tasks.handler.ts's KNOWN_STATUSES exactly - this bypasses the
// handler's validation by writing to the DB directly, so a mismatch here
// seeds tasks in a status the real API would never produce or accept.
const STATUSES = ["todo", "in-progress", "done"] as const;
// The user id the GUI's dev bootstrap mints a session for
// (apps/gui/src/lib/devAuthBootstrap.ts). The seeded org gets this user as a
// member too, so `moon run dev` shows the seeded data immediately instead of
// an empty dashboard until someone pastes the printed token by hand.
const GUI_DEV_USER_ID = "dev-user";

/**
 * `--members N` seeds an organization of N members, so the membership list can
 * be measured at a size nobody reaches by clicking. M03-T06 and M03-T07 found
 * their defects at 100,000 - the old listOrgMembers did not return slowly there,
 * it threw, because it bound one SQL parameter per member.
 *
 * Batched at 500. One insert per row takes minutes at this size, and a single
 * statement carrying 100,000 rows exceeds the very parameter ceiling that
 * defect was about.
 */
const MEMBER_COUNT = (() => {
  const flag = process.argv.indexOf("--members");
  if (flag >= 0 && process.argv[flag + 1]) return Number(process.argv[flag + 1]);
  return Number(process.env.SEED_MEMBER_COUNT) || 0;
})();
const MEMBER_BATCH = 500;

async function seedMembers(db: any, orgId: string, count: number): Promise<number> {
  const started = performance.now();
  const stamp = Date.now();
  for (let start = 0; start < count; start += MEMBER_BATCH) {
    const size = Math.min(MEMBER_BATCH, count - start);
    const users = Array.from({ length: size }, (_, i) => {
      const n = start + i;
      return {
        id: `usr-bulk-${stamp}-${n}`,
        email: `member${n}.${stamp}@seed.local`,
        // Padded so a lexical sort matches the numeric one, which makes
        // "is page 2 the second page" checkable by eye.
        name: `Member ${String(n).padStart(7, "0")}`,
        createdAt: new Date(),
      };
    });
    await db.insert(schema.users).values(users);
    await db.insert(schema.organizationMembers).values(
      users.map((u) => ({ orgId, userId: u.id, role: "member", joinedAt: new Date() })),
    );
  }
  return Math.round(performance.now() - started);
}

async function main() {
  if (process.env.STANDALONE !== "true") {
    console.error("seed.ts only supports STANDALONE=true (SQLite) - it writes directly to the dev DB, not a shared MySQL instance.");
    process.exit(1);
  }

  const db = await setupDatabase("sqlite");
  const now = new Date();

  // Every run produces an independent org, so running the seed twice against
  // the same database adds a second fixture set rather than colliding with the
  // first. The user's email has to vary with it: `users.email` is unique, and a
  // fixed address made the second run die on
  // `UNIQUE constraint failed: users.email` after having already written part
  // of its data.
  const runId = crypto.randomUUID().slice(0, 8);
  const userId = `usr-seed-${runId}`;
  await db.insert(schema.users).values({ id: userId, email: `seed-${runId}@tasker.local`, name: "Seed User", createdAt: now });

  const orgId = `org-seed-${runId}`;
  await db.insert(schema.organizations).values({ id: orgId, name: `Seed Org ${runId}`, slug: `seed-org-${runId}`, createdAt: now });
  await db.insert(schema.organizationMembers).values({ orgId, userId, role: "admin", joinedAt: now });

  // The GUI's dev session is a different user than the one seeded above, so
  // without this the browser lands on an empty dashboard right after seeding.
  // Re-running the seed reuses the existing row rather than failing.
  await db.insert(schema.users)
    .values({ id: GUI_DEV_USER_ID, email: "dev@tasker.local", name: "Dev User", createdAt: now })
    .onConflictDoNothing();
  await db.insert(schema.organizationMembers)
    .values({ orgId, userId: GUI_DEV_USER_ID, role: "admin", joinedAt: now })
    .onConflictDoNothing();

  const templateId = `tpl-seed-${crypto.randomUUID()}`;
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "Seed Template", description: "Generated by scripts/seed.ts", createdAt: now });

  const projectId = `prj-seed-${crypto.randomUUID()}`;
  await db.insert(schema.projects).values({
    id: projectId, orgId, templateId, name: "Seed Project", key: "SEED", nextTaskNumber: TASK_COUNT + 1, ownerId: userId, createdAt: now,
  });

  const taskTypeId = `tt-seed-${crypto.randomUUID()}`;
  await db.insert(schema.taskTypes).values({ id: taskTypeId, orgId, projectId, name: "Task", createdAt: now });

  // Batched for the same reason the member seed is: one insert per row takes
  // minutes at the scale target (50,000 tasks in a project) and the point of
  // this fixture is to be able to reach that scale at all. 500 rows per
  // statement stays well inside SQLite's parameter ceiling.
  const TASK_BATCH = 500;
  const taskSeedStarted = performance.now();
  for (let start = 0; start < TASK_COUNT; start += TASK_BATCH) {
    const size = Math.min(TASK_BATCH, TASK_COUNT - start);
    await db.insert(schema.tasks).values(
      Array.from({ length: size }, (_, k) => {
        const i = start + k;
        return {
          id: `tsk-seed-${crypto.randomUUID()}`,
          projectId,
          displayId: `SEED-${i + 1}`,
          taskTypeId,
          createdBy: userId,
          title: `Seed task #${i + 1}`,
          status: STATUSES[i % STATUSES.length],
          description: "Generated by scripts/seed.ts for local scale testing.",
          // Spread over time rather than all sharing one timestamp: the cursor
          // sorts on createdAt and breaks ties on id, so 50,000 identical
          // timestamps exercise only the tiebreak and hide how the real
          // ordering behaves.
          createdAt: new Date(now.getTime() - (TASK_COUNT - i) * 1000),
        };
      }),
    );
  }
  const taskSeedMs = Math.round(performance.now() - taskSeedStarted);

  const agentRoleId = `role-seed-${crypto.randomUUID()}`;
  await db.insert(schema.agentRoles).values({ id: agentRoleId, orgId, name: "Seed Agent Role", systemPrompt: "You are a seeded test agent.", capabilities: "[]", createdAt: now });
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.agents).values({ id: `agt-seed-${crypto.randomUUID()}`, orgId, agentRoleId, name: `Seed Agent ${i + 1}`, createdAt: now });
  }

  const labelNames = ["bug", "feature", "urgent", "needs-review", "blocked"];
  for (const name of labelNames) {
    await db.insert(schema.labels).values({ id: `lbl-seed-${crypto.randomUUID()}`, orgId, name, color: "#888888", createdAt: now });
  }

  const token = createSessionToken(userId);

  const memberSeedMs = MEMBER_COUNT > 0 ? await seedMembers(db, orgId, MEMBER_COUNT) : 0;

  console.log("Seeded:");
  console.log(`  org:     ${orgId}`);
  console.log(`  project: ${projectId} (key: SEED)`);
  console.log(`  tasks:   ${TASK_COUNT} (seeded in ${taskSeedMs}ms)`);
  console.log(`  agents:  5`);
  console.log(`  labels:  ${labelNames.length}`);
  if (MEMBER_COUNT > 0) console.log(`  members: ${MEMBER_COUNT} (seeded in ${memberSeedMs}ms)`);
  console.log("");
  console.log(`The GUI's dev user (${GUI_DEV_USER_ID}) is a member of this org - reload http://localhost:5173 and the data is there.`);
  console.log("");
  console.log("Session token for the seeded user (paste into a `session` cookie, or use as a Bearer header):");
  console.log(token);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
