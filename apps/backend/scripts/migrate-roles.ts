// Reconciles `grants` against `organization_members` for every
// organization-scope, system-role grant.
//
// M10-T03's own migration (0034/0021) seeds the permission vocabulary, the
// four system roles, and backfills every organization_members row that
// existed *at migration time* into a grant. It deliberately does not
// dual-write the two tables going forward - organization_members stays the
// live write path through T04 (seedOrg / updateOrgMemberRole / removeMember
// / consumePendingInvitations are untouched), and only T05's cutover moves
// both the read path and these write sites onto `grants` together, so there
// is exactly one task where both sides change at once instead of a window
// where they could silently drift.
//
// Until T05 lands, this script is how that gap gets closed on demand: any
// org created, membership added/removed, or role changed since the last run
// leaves `grants` behind organization_members, and this script computes and
// (unless --dry-run) applies the minimal diff to catch it back up. Safe to
// run repeatedly - a clean database produces an empty plan.
//
// Run with: `bun run scripts/migrate-roles.ts [--dry-run]` (from
// apps/backend). Set STANDALONE=true for the local SQLite database;
// otherwise it connects to MySQL using the same DB_* env vars as the server.
import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { setupDatabase } from "../src/db/db";
import * as schemaSqlite from "../src/db/schema.sqlite";
import * as schemaMysql from "../src/db/schema.mysql";

const DRY_RUN = process.argv.includes("--dry-run");
const STANDALONE = process.env.STANDALONE === "true";

// Only `role-<name>` grants are this script's concern - a custom role
// (org_id NOT NULL, T04+) is never something a plain organization_members
// row implies, so reconciling it here would be guessing at intent that
// belongs to whoever created that custom grant by hand.
const isSystemRoleId = (roleId: string) => roleId.startsWith("role-");
const subjectScopeKey = (subjectId: string, scopeId: string) => `${subjectId}::${scopeId}`;

async function main() {
  const db = STANDALONE
    ? await setupDatabase("sqlite", process.env.SQLITE_PATH || ".data/local.sqlite")
    : await setupDatabase("mysql");
  const schema = STANDALONE ? schemaSqlite : schemaMysql;

  const members = await db.select().from(schema.organizationMembers);
  const orgScopeGrants = await db
    .select()
    .from(schema.grants)
    .where(and(eq(schema.grants.subjectType, "user"), eq(schema.grants.scopeType, "organization")));

  const grantsBySubjectScope = new Map<string, typeof orgScopeGrants>();
  for (const g of orgScopeGrants) {
    if (!isSystemRoleId(g.roleId)) continue;
    const key = subjectScopeKey(g.subjectId, g.scopeId);
    const list = grantsBySubjectScope.get(key) ?? [];
    list.push(g);
    grantsBySubjectScope.set(key, list);
  }

  const memberKeys = new Set(members.map((m: any) => subjectScopeKey(m.userId, m.orgId)));

  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; roleId: string }> = [];
  const toDelete: string[] = [];

  for (const m of members as any[]) {
    const key = subjectScopeKey(m.userId, m.orgId);
    const wantRoleId = `role-${m.role}`;
    const current = grantsBySubjectScope.get(key) ?? [];
    if (current.length === 0) {
      toInsert.push({
        id: `grant-${randomUUID()}`,
        subjectType: "user",
        subjectId: m.userId,
        scopeType: "organization",
        scopeId: m.orgId,
        roleId: wantRoleId,
        createdAt: m.joinedAt,
      });
    } else if (!current.some((g: any) => g.roleId === wantRoleId)) {
      // Update the existing grant in place rather than delete-and-reinsert,
      // so its original createdAt (when this membership was first granted)
      // survives a role change instead of resetting to "now".
      toUpdate.push({ id: current[0].id, roleId: wantRoleId });
    }
  }

  for (const [key, list] of grantsBySubjectScope) {
    if (!memberKeys.has(key)) {
      for (const g of list) toDelete.push(g.id);
    }
  }

  console.log(`organization_members rows: ${members.length}`);
  console.log(`existing organization-scope system-role grants: ${orgScopeGrants.length}`);
  console.log(`plan: insert ${toInsert.length}, update ${toUpdate.length}, delete ${toDelete.length}`);

  if (DRY_RUN) {
    for (const g of toInsert) console.log(`  + insert  user ${g.subjectId} @ org ${g.scopeId} -> ${g.roleId}`);
    for (const u of toUpdate) console.log(`  ~ update  grant ${u.id} -> ${u.roleId}`);
    for (const id of toDelete) console.log(`  - delete  grant ${id} (no matching membership)`);
    console.log("dry run - no changes written");
    process.exit(0);
  }

  for (const g of toInsert) await db.insert(schema.grants).values(g);
  for (const u of toUpdate) await db.update(schema.grants).set({ roleId: u.roleId }).where(eq(schema.grants.id, u.id));
  if (toDelete.length > 0) await db.delete(schema.grants).where(inArray(schema.grants.id, toDelete));

  console.log("reconciliation complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
