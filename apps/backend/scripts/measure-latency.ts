// Measures p50/p95 for every hot list endpoint against whatever the database
// currently holds, and prints a markdown table ready to paste into a milestone
// journal.
//
// Run with: `bun run scripts/measure-latency.ts` (from apps/backend), after
// `bun run scripts/seed.ts --scale large`.
//
// Calls the handlers directly rather than going over HTTP. The number this is
// meant to defend is the *server's* answer time — how long the query and its
// serialisation take — and putting a socket, a proxy and Connect's codec in
// front of it measures the machine's networking as much as the read path. The
// browser-side figure is measured separately, in a real browser, and recorded
// alongside (see M07-T03).
//
// Repeatable on purpose: same script, same percentiles, same table, so two
// runs weeks apart are comparable rather than two different anecdotes.
import { setupDatabase } from "../src/db/db";
import * as schema from "../src/db/schema.sqlite";
import { createContextValues } from "@connectrpc/connect";
import { currentUserIdKey } from "../src/modules/auth/session";
import { createTaskManagementHandler } from "../src/modules/tasks/tasks.handler";
import { createArtifactsHandler } from "../src/modules/artifacts/artifacts.handler";
import { createProjectsHandler } from "../src/modules/projects/projects.handler";
import { createAgentsHandler } from "../src/modules/agents/agents.handler";
import { createOrgsHandler } from "../src/modules/orgs/orgs.handler";
import createSearchHandler from "../src/modules/search/search.handler";
import createDashboardHandler from "../src/modules/dashboard/dashboard.handler";
import createReportsHandler from "../src/modules/reports/reports.handler";
import { sql } from "drizzle-orm";

/** Enough samples for a p95 to mean something, few enough to run in seconds. */
const SAMPLES = Number(process.env.MEASURE_SAMPLES) || 50;
/** Discarded: the first calls pay for query planning and cache warming. */
const WARMUP = 5;

function percentile(sorted: number[], p: number): number {
  // Nearest-rank. With 50 samples p95 is the 48th, which is a real observation
  // rather than an interpolation between two of them.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

async function measure(name: string, budgetMs: number, call: () => Promise<unknown>) {
  // Progress to stderr as each endpoint starts and finishes. The first version
  // printed only the final table, so when `universalSearch` took six minutes
  // at the scale target the script was indistinguishable from a hang — and the
  // slowest endpoint is precisely the one worth seeing early.
  console.error(`  measuring ${name}…`);
  const started = performance.now();
  for (let i = 0; i < WARMUP; i++) await call();

  const timings: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const started = performance.now();
    await call();
    timings.push(performance.now() - started);
  }
  timings.sort((a, b) => a - b);
  console.error(`    ${Math.round(performance.now() - started)}ms for ${WARMUP + SAMPLES} calls`);

  return {
    name,
    budgetMs,
    p50: percentile(timings, 50),
    p95: percentile(timings, 95),
    within: percentile(timings, 95) <= budgetMs,
  };
}

/** Captures a handler that registers onto a router rather than returning one. */
function captureRouterMethods(register: (router: any, db: any) => void, db: any) {
  const captured: Record<string, any> = {};
  register({ service: (_svc: unknown, impl: Record<string, any>) => Object.assign(captured, impl) } as any, db);
  return captured;
}

async function main() {
  process.env.STANDALONE = "true";
  const db = (await setupDatabase("sqlite")) as any;

  // Measure against the largest seeded org/project rather than whichever was
  // seeded last: a fixture that happens to be empty produces fast, meaningless
  // numbers, and that is exactly the failure this script exists to avoid.
  const [biggestProject] = await db.all(sql`
    SELECT t.project_id AS projectId, p.org_id AS orgId, count(*) AS taskCount
    FROM tasks t JOIN projects p ON p.id = t.project_id
    GROUP BY t.project_id ORDER BY count(*) DESC LIMIT 1
  `);
  if (!biggestProject) {
    console.error("No tasks in the database. Run `bun run scripts/seed.ts --scale large` first.");
    process.exit(1);
  }

  const { projectId, orgId, taskCount } = biggestProject;

  // Each endpoint is measured against the *largest* fixture for that endpoint,
  // not against one org picked for all of them. The first version chose the org
  // owning the biggest task project and measured `listProjects` and
  // `listOrgMembers` there too — an org with 1 project and 2 members. The
  // numbers were real and meaningless, which is worse than no numbers.
  const [biggestFolder] = await db.all(sql`
    SELECT folder_id AS folderId, count(*) AS artifactCount
    FROM artifacts GROUP BY folder_id ORDER BY count(*) DESC LIMIT 1
  `);
  const [projectHeavyOrg] = await db.all(sql`
    SELECT org_id AS orgId, count(*) AS c FROM projects GROUP BY org_id ORDER BY count(*) DESC LIMIT 1
  `);
  const [memberHeavyOrg] = await db.all(sql`
    SELECT org_id AS orgId, count(*) AS c FROM organization_members GROUP BY org_id ORDER BY count(*) DESC LIMIT 1
  `);

  /** A context for some member of the given org — every read is org-scoped. */
  async function ctxFor(org: string) {
    const [member] = await db.all(sql`SELECT user_id AS userId FROM organization_members WHERE org_id = ${org} LIMIT 1`);
    const values = createContextValues();
    values.set(currentUserIdKey, member.userId);
    return { values } as any;
  }

  const ctx = await ctxFor(orgId);
  const projectCtx = await ctxFor(projectHeavyOrg.orgId);
  const memberCtx = await ctxFor(memberHeavyOrg.orgId);

  const tasks = createTaskManagementHandler(db, null as any);
  const artifacts = createArtifactsHandler(db, null as any);
  const projects = createProjectsHandler(db, null as any);
  const agents = createAgentsHandler(db, null as any);
  const orgs = createOrgsHandler(db, null as any);
  const search = captureRouterMethods(createSearchHandler as any, db);
  const dashboard = captureRouterMethods(createDashboardHandler as any, db);
  const reports = captureRouterMethods(createReportsHandler as any, db);

  // Budgets are the ones documented in `.specs/standards/api-standard.md`.
  const results = [
    await measure("listTasks (project, first page)", 150, () =>
      tasks.listTasks({ projectId, page: { limit: 50 } }, ctx)),
    await measure("listTasks (one board column)", 150, () =>
      tasks.listTasks({ projectId, status: "todo", page: { limit: 50 } }, ctx)),
    await measure("listArtifacts (folder, first page)", 150, () =>
      artifacts.listArtifacts({ folderId: biggestFolder?.folderId, page: { limit: 50 } }, ctx)),
    await measure("listProjects (org)", 150, () =>
      projects.listProjects({ orgId: projectHeavyOrg.orgId, page: { limit: 50 } }, projectCtx)),
    await measure("listAgents (org)", 150, () =>
      agents.listAgents({ orgId, page: { limit: 50 } }, ctx)),
    await measure("listOrgMembers (org)", 150, () =>
      orgs.listOrgMembers({ orgId: memberHeavyOrg.orgId, page: { limit: 50 } }, memberCtx)),
    await measure("universalSearch", 300, () =>
      search.universalSearch({ query: "seed", orgId, page: { limit: 20 } }, ctx)),
    await measure("getDashboard", 300, () =>
      dashboard.getDashboard({ orgId }, ctx)),
    // M24: both Reports RPCs at the widest window - the trends pass reads the
    // project's ENTIRE activity history for the CFD, so the window barely
    // shields it and the seeded activity volume is what's being defended.
    await measure("getReportExceptions", 300, () =>
      reports.getReportExceptions({ projectId, windowDays: 90 }, ctx)),
    await measure("getReportTrends", 300, () =>
      reports.getReportTrends({ projectId, windowDays: 90 }, ctx)),
  ];

  console.log("");
  console.log(`Fixture: ${taskCount} tasks in the measured project, ` +
    `${biggestFolder?.artifactCount ?? 0} artifacts in the measured folder, ` +
    `${projectHeavyOrg.c} projects in the measured org, ${memberHeavyOrg.c} members in the measured org.`);
  console.log(`${SAMPLES} samples per endpoint, ${WARMUP} discarded as warmup. Percentiles by nearest rank.`);
  console.log("");
  console.log("| Endpoint | Budget | p50 | p95 | Within budget |");
  console.log("|---|---|---|---|---|");
  for (const r of results) {
    console.log(`| \`${r.name}\` | ${r.budgetMs} ms | ${r.p50.toFixed(1)} ms | ${r.p95.toFixed(1)} ms | ${r.within ? "yes" : "**no**"} |`);
  }
  console.log("");

  const over = results.filter((r) => !r.within);
  if (over.length > 0) {
    console.error(`${over.length} endpoint(s) over budget: ${over.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Measurement failed:", err);
  process.exit(1);
});
