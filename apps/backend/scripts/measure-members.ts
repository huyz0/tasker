/**
 * Measures listOrgMembers at a chosen organization size.
 *
 * M03-T06's exit criterion is a latency budget — "page 1 in under 200 ms
 * against 100,000 members" — and a budget asserted in the unit suite is a flaky
 * gate on a shared machine. This keeps the measurement reproducible without
 * making CI fail because a runner was busy.
 *
 *   bun run scripts/measure-members.ts            # 1k, 10k, 100k
 *   bun run scripts/measure-members.ts 250000     # one specific size
 *
 * Runs against a throwaway in-memory database, so it neither reads nor touches
 * the dev data.
 */
process.env.STANDALONE = "true";

import { setupDatabase } from "../src/db/db";
import * as schema from "../src/db/schema.sqlite";
import { createOrgsHandler } from "../src/modules/orgs/orgs.handler";
import { createContextValues } from "@connectrpc/connect";
import { currentUserIdKey } from "../src/modules/auth/session";

const BATCH = 1000;
const BUDGET_MS = 200;

const authContext = (userId: string) => {
  const values = createContextValues();
  values.set(currentUserIdKey, userId);
  return { values } as any;
};

async function measure(count: number) {
  const db: any = await setupDatabase("sqlite", ":memory:");
  const handler = createOrgsHandler(db, null);
  const orgId = "org-measure";
  const adminId = "admin-measure";

  await db.insert(schema.organizations).values({ id: orgId, name: "Measured", slug: orgId, createdAt: new Date() });
  await db.insert(schema.users).values({ id: adminId, email: "admin@measure.local", name: "Admin", createdAt: new Date() });
  await db.insert(schema.organizationMembers).values({ orgId, userId: adminId, role: "admin", joinedAt: new Date() });

  const seedStart = performance.now();
  for (let start = 0; start < count; start += BATCH) {
    const size = Math.min(BATCH, count - start);
    const users = Array.from({ length: size }, (_, i) => {
      const n = start + i;
      return { id: `u-${n}`, email: `m${n}@measure.local`, name: `Member ${String(n).padStart(7, "0")}`, createdAt: new Date() };
    });
    await db.insert(schema.users).values(users);
    await db.insert(schema.organizationMembers).values(users.map((u) => ({ orgId, userId: u.id, role: "member", joinedAt: new Date() })));
  }
  const seedMs = Math.round(performance.now() - seedStart);

  const ctx = authContext(adminId);
  const time = async (fn: () => Promise<any>) => {
    await fn(); // warm
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await fn();
      runs.push(performance.now() - t);
    }
    runs.sort((a, b) => a - b);
    return runs[2]!; // median of five
  };

  const firstPage: any = await handler.listOrgMembers({ orgId, page: { sort: "name:asc" } }, ctx);
  const results = {
    count: count + 1,
    seedMs,
    page1: await time(() => handler.listOrgMembers({ orgId }, ctx)),
    sorted: await time(() => handler.listOrgMembers({ orgId, page: { sort: "name:asc" } }, ctx)),
    filtered: await time(() => handler.listOrgMembers({ orgId, page: { filter: `Member ${String(Math.floor(count / 2)).padStart(7, "0")}` } }, ctx)),
    facet: await time(() => handler.listOrgMembers({ orgId, role: "member" }, ctx)),
    deep: await time(() => handler.listOrgMembers({ orgId, page: { sort: "name:asc", cursor: firstPage.page.nextCursor } }, ctx)),
  };
  return results;
}

const sizes = process.argv[2] ? [Number(process.argv[2])] : [1000, 10000, 100000];

console.log("listOrgMembers — median of 5, after one warm-up call\n");
console.log("members   seed      page1     sorted    filtered  facet     deep");
console.log("--------  --------  --------  --------  --------  --------  --------");

let overBudget = 0;
for (const size of sizes) {
  const r = await measure(size);
  const cell = (ms: number) => {
    if (ms > BUDGET_MS) overBudget++;
    return `${ms.toFixed(1)}ms`.padEnd(10);
  };
  console.log(
    String(r.count).padEnd(10) +
      `${r.seedMs}ms`.padEnd(10) +
      cell(r.page1) + cell(r.sorted) + cell(r.filtered) + cell(r.facet) + cell(r.deep),
  );
}

console.log(
  overBudget === 0
    ? `\nPASS — every measurement inside the ${BUDGET_MS}ms budget`
    : `\nFAIL — ${overBudget} measurement(s) over the ${BUDGET_MS}ms budget`,
);
process.exit(overBudget === 0 ? 0 : 1);
