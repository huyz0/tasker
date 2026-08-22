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

/**
 * `--scale small|medium|large` picks a fixture size. The names are the
 * milestone's own scale targets rather than round numbers: **large** is
 * 2,000 projects, 50,000 tasks in one project and 100,000 artifacts, which is
 * what M07's goal states the product must answer within budget.
 *
 * `small` stays the default so the everyday `bun run seed` is still seconds,
 * not minutes. Explicit env vars still win, so an existing
 * `SEED_TASK_COUNT=…` invocation keeps working.
 */
const SCALES = {
  small: { tasks: 150, projects: 3, artifacts: 50, members: 0 },
  medium: { tasks: 5_000, projects: 200, artifacts: 10_000, members: 1_000 },
  large: { tasks: 50_000, projects: 2_000, artifacts: 100_000, members: 10_000 },
} as const;

type ScaleName = keyof typeof SCALES;

const SCALE: ScaleName = (() => {
  const flag = process.argv.indexOf("--scale");
  const value = flag >= 0 ? process.argv[flag + 1] : undefined;
  if (value && value in SCALES) return value as ScaleName;
  if (value) {
    console.error(`Unknown --scale "${value}". Expected one of: ${Object.keys(SCALES).join(", ")}`);
    process.exit(1);
  }
  return "small";
})();

const TASK_COUNT = Number(process.env.SEED_TASK_COUNT) || SCALES[SCALE].tasks;
const PROJECT_COUNT = Number(process.env.SEED_PROJECT_COUNT) || SCALES[SCALE].projects;
const ARTIFACT_COUNT = Number(process.env.SEED_ARTIFACT_COUNT) || SCALES[SCALE].artifacts;
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
  return Number(process.env.SEED_MEMBER_COUNT) || SCALES[SCALE].members;
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

/**
 * M24-T06: the seed writes tasks with direct inserts, bypassing the handlers
 * that normally record `task_activity` (ADR-0020) — so the history the
 * Reports screen aggregates must be seeded here too, or a seeded project
 * would chart as if nothing had ever happened.
 *
 * Journeys are index-deterministic, the same idiom as the `i % STATUSES`
 * status cycle above: `i % 6` picks a journey consistent with the task's
 * seeded status, and small co-prime cycles (7/11/13) sprinkle notes,
 * comments and handoffs — no RNG, so two runs produce the same shape.
 * Every journey starts at 'todo' and telescopes to the task's live status,
 * which is what keeps the CFD's +1/-1 algebra balanced against a live
 * GROUP BY (the M24 exit criterion).
 */
async function seedTaskActivity(
  db: any,
  args: {
    batch: { id: string; status: string; createdAt: Date }[];
    startIndex: number;
    projectId: string;
    userId: string;
    agentIds: string[];
    now: Date;
    stamp: number;
    stats: { rows: number; assignments: number };
  },
) {
  const { batch, startIndex, projectId, userId, agentIds, now, stamp, stats } = args;
  const HOUR = 3600_000;
  const rows: any[] = [];
  const assignments: any[] = [];

  for (let k = 0; k < batch.length; k++) {
    const i = startIndex + k;
    const t = batch[k]!;
    const agentId = agentIds[i % agentIds.length]!;
    // Activity never post-dates "now": tasks seeded near the present clamp
    // their follow-up events instead of writing the future.
    const at = (offsetMs: number) => new Date(Math.min(t.createdAt.getTime() + offsetMs, now.getTime()));
    const base = {
      taskId: t.id, projectId, fromStatus: null, toStatus: null,
      fromIsTerminal: false, toIsTerminal: false,
      actorType: "user", actorId: userId, assigneeAgentId: null, assigneeUserId: null,
    };
    const add = (suffix: string, over: Record<string, unknown>) =>
      rows.push({ ...base, id: `act-seed-${stamp}-${i}-${suffix}`, ...over });

    const journey = i % 6; // 0/3 → todo, 1/4 → in-progress, 2/5 → done (i % 3)
    // Live claims are the exception, not the norm: a fleet of five agents
    // holding thousands of simultaneous claims would be fiction, and it is
    // the stalled-claims panel's own premise that held-and-silent is rare
    // enough to act on. ~1 in 18 in-progress tasks stays agent-held, ~1 in
    // 36 todo tasks is a claimed-never-started straggler.
    const heldWip = journey === 1 && i % 18 === 1;
    const neverStarted = journey === 3 && i % 36 === 3;
    const claimed = heldWip || neverStarted || journey === 2;

    // One 'created' row per task, at the task's own createdAt.
    add("created", { kind: "created", toStatus: "todo", occurredAt: t.createdAt });
    if (claimed) {
      add("claim", { kind: "claimed", actorType: "agent", actorId: agentId, assigneeAgentId: agentId, occurredAt: at(HOUR / 2) });
    }

    if (journey === 1) {
      if (heldWip) {
        // In progress, agent-held: the stalled-claims panel's natural food.
        add("wip", { kind: "status_changed", fromStatus: "todo", toStatus: "in-progress", actorType: "agent", actorId: agentId, assigneeAgentId: agentId, occurredAt: at(HOUR) });
        assignments.push({ id: `tas-seed-${stamp}-${i}`, taskId: t.id, agentId });
      } else {
        add("wip", { kind: "status_changed", fromStatus: "todo", toStatus: "in-progress", occurredAt: at(HOUR) });
      }
    } else if (journey === 4) {
      // In progress, human-moved, nobody holds it: oldest-unclaimed food.
      add("wip", { kind: "status_changed", fromStatus: "todo", toStatus: "in-progress", occurredAt: at(HOUR) });
    } else if (journey === 2) {
      // Agent-claimed, completed, then released by a human. Some completions
      // are clicked by the human while the agent holds the task - the
      // scorecard's assignee-attribution case.
      const humanFlip = i % 12 === 2;
      add("done", {
        kind: "status_changed", fromStatus: "todo", toStatus: "done", toIsTerminal: true,
        actorType: humanFlip ? "user" : "agent", actorId: humanFlip ? userId : agentId,
        assigneeAgentId: agentId, occurredAt: at(2 * HOUR),
      });
      add("release", { kind: "unassigned", assigneeAgentId: agentId, occurredAt: at(3 * HOUR) });
    } else if (journey === 5) {
      // Human-completed, never claimed.
      add("done", { kind: "status_changed", fromStatus: "todo", toStatus: "done", toIsTerminal: true, occurredAt: at(HOUR) });
    } else if (neverStarted) {
      // Claimed and never touched again: never-started stalled food.
      assignments.push({ id: `tas-seed-${stamp}-${i}`, taskId: t.id, agentId });
    }

    if (i % 7 === 0) {
      add("note", { kind: "note", actorType: claimed ? "agent" : "user", actorId: claimed ? agentId : userId, assigneeAgentId: claimed ? agentId : null, occurredAt: at(45 * 60_000) });
    }
    if (i % 11 === 0) add("comment", { kind: "comment", occurredAt: at(50 * 60_000) });
    if (i % 13 === 0 && claimed) {
      add("handoff", { kind: "handoff", actorType: "agent", actorId: agentId, assigneeAgentId: agentId, occurredAt: at(70 * 60_000) });
    }
  }

  // 13 columns per row: 300-row chunks stay far inside SQLite's parameter
  // ceiling, same batching reasoning as every other bulk insert here.
  for (let s = 0; s < rows.length; s += 300) {
    await db.insert(schema.taskActivity).values(rows.slice(s, s + 300));
  }
  if (assignments.length > 0) {
    await db.insert(schema.taskAssignments).values(assignments);
  }
  stats.rows += rows.length;
  stats.assignments += assignments.length;
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

  const stamp = Date.now();
  const templateId = `tpl-seed-${crypto.randomUUID()}`;
  await db.insert(schema.projectTemplates).values({ id: templateId, orgId, name: "Seed Template", description: "Generated by scripts/seed.ts", createdAt: now });

  const projectId = `prj-seed-${crypto.randomUUID()}`;
  await db.insert(schema.projects).values({
    id: projectId, orgId, templateId, name: "Seed Project", key: "SEED", nextTaskNumber: TASK_COUNT + 1, ownerId: userId, createdAt: now,
  });

  const taskTypeId = `tt-seed-${crypto.randomUUID()}`;
  await db.insert(schema.taskTypes).values({ id: taskTypeId, orgId, projectId, name: "Task", createdAt: now });

  // Agents are seeded before tasks (they used to come after) because the
  // task_activity journeys below attribute claims and completions to them.
  const agentRoleId = `role-seed-${crypto.randomUUID()}`;
  await db.insert(schema.agentRoles).values({ id: agentRoleId, orgId, name: "Seed Agent Role", systemPrompt: "You are a seeded test agent.", capabilities: "[]", createdAt: now });
  const agentIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = `agt-seed-${crypto.randomUUID()}`;
    agentIds.push(id);
    await db.insert(schema.agents).values({ id, orgId, agentRoleId, name: `Seed Agent ${i + 1}`, createdAt: now });
  }

  // Batched for the same reason the member seed is: one insert per row takes
  // minutes at the scale target (50,000 tasks in a project) and the point of
  // this fixture is to be able to reach that scale at all. 500 rows per
  // statement stays well inside SQLite's parameter ceiling.
  //
  // Spread over ~180 days rather than one second apart: the cursor still gets
  // distinct ordered timestamps (its original purpose), and the M24 report
  // charts get a mature project's history - part inside the widest 90-day
  // report window, part before it, which is exactly the window/baseline split
  // the report queries have to be fast against.
  const TASK_BATCH = 500;
  const TASK_SPACING_MS = Math.max(1000, Math.floor((180 * 24 * 3600_000) / TASK_COUNT));
  const taskCreatedAt = (i: number) => new Date(now.getTime() - (TASK_COUNT - i) * TASK_SPACING_MS);
  const taskSeedStarted = performance.now();
  const activityStats = { rows: 0, assignments: 0 };
  for (let start = 0; start < TASK_COUNT; start += TASK_BATCH) {
    const size = Math.min(TASK_BATCH, TASK_COUNT - start);
    const batch = Array.from({ length: size }, (_, k) => {
      const i = start + k;
      return {
        id: `tsk-seed-${crypto.randomUUID()}`,
        projectId,
        displayId: `SEED-${i + 1}`,
        // M24-T10: every 10th task is untyped (the column is nullable and
        // "untyped" is a first-class CFD scope in getReportTrends). With a
        // single typed vocabulary the Reports CFD selector renders exactly
        // one option and cannot be *changed*, so the e2e could never prove
        // the selector re-queries; this gives it a second deterministic
        // option ("Untyped") while "Task" stays the most-used default.
        taskTypeId: i % 10 === 9 ? null : taskTypeId,
        createdBy: userId,
        title: `Seed task #${i + 1}`,
        status: STATUSES[i % STATUSES.length],
        description: "Generated by scripts/seed.ts for local scale testing.",
        createdAt: taskCreatedAt(i),
      };
    });
    await db.insert(schema.tasks).values(batch);
    await seedTaskActivity(db, { batch, startIndex: start, projectId, userId, agentIds, now, stamp, stats: activityStats });
  }
  const taskSeedMs = Math.round(performance.now() - taskSeedStarted);

  // The other two scale targets: 2,000 projects in the org, and 100,000
  // artifacts. Batched for the same reason tasks are — at `large` these are
  // the rows that make the fixture take minutes rather than hours.
  const BULK_BATCH = 500;

  const extraProjects = Math.max(PROJECT_COUNT - 1, 0);
  const projectSeedStarted = performance.now();
  for (let start = 0; start < extraProjects; start += BULK_BATCH) {
    const size = Math.min(BULK_BATCH, extraProjects - start);
    await db.insert(schema.projects).values(
      Array.from({ length: size }, (_, k) => {
        const i = start + k;
        return {
          id: `prj-bulk-${stamp}-${i}`,
          orgId,
          templateId,
          // `key` is unique per org at the DB level, so it has to vary.
          key: `SD${String(i).padStart(5, "0")}`,
          name: `Bulk Project ${String(i).padStart(5, "0")}`,
          ownerId: userId,
          createdAt: new Date(now.getTime() - (extraProjects - i) * 1000),
        };
      }),
    );
  }
  const projectSeedMs = Math.round(performance.now() - projectSeedStarted);

  // Artifacts hang off a folder, so one folder carries the whole bulk set —
  // which is also the shape that made the old full-content artifact list
  // expensive (M07-T02).
  const folderId = `fld-seed-${crypto.randomUUID()}`;
  await db.insert(schema.folders).values({ id: folderId, projectId, name: "Seed Folder", createdAt: now });

  const artifactSeedStarted = performance.now();
  for (let start = 0; start < ARTIFACT_COUNT; start += BULK_BATCH) {
    const size = Math.min(BULK_BATCH, ARTIFACT_COUNT - start);
    await db.insert(schema.artifacts).values(
      Array.from({ length: size }, (_, k) => {
        const i = start + k;
        return {
          id: `art-bulk-${stamp}-${i}`,
          folderId,
          name: `Bulk Artifact ${String(i).padStart(6, "0")}`,
          description: "Generated by scripts/seed.ts for local scale testing.",
          content: `# Artifact ${i}\n\nGenerated body for local scale testing.`,
          contentType: "text/markdown",
          createdAt: new Date(now.getTime() - (ARTIFACT_COUNT - i) * 1000),
        };
      }),
    );
  }
  const artifactSeedMs = Math.round(performance.now() - artifactSeedStarted);

  const labelNames = ["bug", "feature", "urgent", "needs-review", "blocked"];
  for (const name of labelNames) {
    await db.insert(schema.labels).values({ id: `lbl-seed-${crypto.randomUUID()}`, orgId, name, color: "#888888", createdAt: now });
  }

  const token = createSessionToken(userId);

  const memberSeedMs = MEMBER_COUNT > 0 ? await seedMembers(db, orgId, MEMBER_COUNT) : 0;

  console.log("Seeded:");
  console.log(`  org:     ${orgId}`);
  console.log(`  project: ${projectId} (key: SEED)`);
  console.log(`  scale:   ${SCALE}`);
  console.log(`  tasks:   ${TASK_COUNT} (seeded in ${taskSeedMs}ms)`);
  console.log(`  task_activity: ${activityStats.rows} rows, ${activityStats.assignments} live claims (M24 reports history)`);
  console.log(`  projects: ${PROJECT_COUNT} (seeded in ${projectSeedMs}ms)`);
  console.log(`  artifacts: ${ARTIFACT_COUNT} in folder ${folderId} (seeded in ${artifactSeedMs}ms)`);
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
