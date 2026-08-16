import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, not } from "drizzle-orm";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const CreateTeamSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const UpdateTeamSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
  name: z.string().min(1, "name is required").max(256),
});

const ArchiveTeamSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
});

const RestoreTeamSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
});

const AddTeamMemberSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
  userId: z.string().min(1, "userId is required"),
});

const RemoveTeamMemberSchema = AddTeamMemberSchema;

const ListTeamMembersSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
  page: z.any().optional(),
});

// --- Handler Factory ---

/**
 * Team CRUD and membership (M10-T07, ADR-0013). Every RPC here is checked
 * against `team:<verb>` at *organization* scope, not team scope: creating,
 * renaming, archiving, and rostering a team are all organization-level
 * administrative acts on a resource the org owns, the same shape project
 * and task-type CRUD already take against their owning org. This is a
 * deliberate reading of `lib/policy.ts`'s own note that `can()` does not
 * auto-climb team scope to organization scope - it's each RPC's mapping
 * decision, and every RPC here makes the same one. A *team-scoped* grant
 * (checked with `{type: 'team', id: teamId}`) is for narrower per-team
 * authority once something needs to delegate managing one specific team
 * without organization-wide `team:write` - nothing here needs that yet.
 */
export const createTeamsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  const teamsTable = () => (isStandalone ? schemaSqlite.teams : schemaMysql.teams);
  const teamMembersTable = () => (isStandalone ? schemaSqlite.teamMembers : schemaMysql.teamMembers);
  const usersTable = () => (isStandalone ? schemaSqlite.users : schemaMysql.users);

  const loadTeam = async (teamId: string) => {
    const teams = teamsTable();
    const rows = await db.select().from(teams).where(eq((teams as any).id, teamId)).limit(1);
    if (!rows || rows.length === 0) throw new ConnectError("team not found", Code.NotFound);
    return rows[0];
  };

  return {
    async createTeam(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateTeamSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "team:write");

      const teams = teamsTable();
      const newId = `team-${crypto.randomUUID()}`;
      const payload = { id: newId, orgId: parsed.orgId, name: parsed.name };

      await insertRecord(db, teams, payload, isStandalone);

      const team = { ...payload, deletedAt: null };
      publishDomainEvent(nc, "domain.team.created", team);
      return { team };
    },

    async updateTeam(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateTeamSchema.parse(req);
      const existing = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing.orgId }, "team:write");

      const teams = teamsTable();
      await db.update(teams).set({ name: parsed.name }).where(eq((teams as any).id, parsed.teamId));

      const updated = { ...existing, name: parsed.name };
      publishDomainEvent(nc, "domain.team.updated", updated);
      return { team: updated };
    },

    async archiveTeam(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveTeamSchema.parse(req);
      const existing = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing.orgId }, "team:admin");

      await softDeleteById(db, teamsTable(), parsed.teamId);

      publishDomainEvent(nc, "domain.team.archived", { teamId: parsed.teamId });
      return { success: true };
    },

    async restoreTeam(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreTeamSchema.parse(req);
      const existing = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing.orgId }, "team:admin");

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const orgRows = await db.select().from(orgs).where(eq((orgs as any).id, existing.orgId)).limit(1);
      if (orgRows[0]?.deletedAt) {
        throw new ConnectError("cannot restore a team into an archived organization - restore the organization first", Code.FailedPrecondition);
      }

      await restoreById(db, teamsTable(), parsed.teamId);

      publishDomainEvent(nc, "domain.team.restored", { teamId: parsed.teamId });
      return { success: true };
    },

    async listTeams(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      if (!req?.orgId) throw new ConnectError("orgId is required", Code.InvalidArgument);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: req.orgId }, "team:read");

      const teams = teamsTable();
      const deletedFilter = req.onlyDeleted ? not(notDeleted(teams)) : notDeleted(teams);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db, teams, and(eq((teams as any).orgId, req.orgId), deletedFilter), req.page,
        {
          filterColumn: (teams as any).name,
          sortableColumns: { name: (teams as any).name, createdAt: (teams as any).createdAt },
          select: {
            id: (teams as any).id,
            orgId: (teams as any).orgId,
            name: (teams as any).name,
            createdAt: (teams as any).createdAt,
            deletedAt: (teams as any).deletedAt,
          },
        },
      );

      return {
        teams: items.map((t: any) => ({
          ...t,
          createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
          deletedAt: t.deletedAt instanceof Date ? t.deletedAt.toISOString() : t.deletedAt,
        })),
        page: { nextCursor, totalCount },
      };
    },

    async addTeamMember(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = AddTeamMemberSchema.parse(req);
      const team = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: team.orgId }, "team:write");

      const userRows = await db.select().from(usersTable()).where(eq((usersTable() as any).id, parsed.userId)).limit(1);
      if (!userRows || userRows.length === 0) throw new ConnectError("user not found", Code.NotFound);

      const members = teamMembersTable();
      const existing = await db.select().from(members)
        .where(and(eq((members as any).teamId, parsed.teamId), eq((members as any).userId, parsed.userId)))
        .limit(1);
      if (existing.length > 0) return { success: true };

      await db.insert(members).values({ teamId: parsed.teamId, userId: parsed.userId, joinedAt: new Date() });

      publishDomainEvent(nc, "domain.team.member_added", { teamId: parsed.teamId, userId: parsed.userId });
      return { success: true };
    },

    async removeTeamMember(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RemoveTeamMemberSchema.parse(req);
      const team = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: team.orgId }, "team:write");

      const members = teamMembersTable();
      await db.delete(members).where(and(eq((members as any).teamId, parsed.teamId), eq((members as any).userId, parsed.userId)));

      publishDomainEvent(nc, "domain.team.member_removed", { teamId: parsed.teamId, userId: parsed.userId });
      return { success: true };
    },

    async listTeamMembers(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListTeamMembersSchema.parse(req);
      const team = await loadTeam(parsed.teamId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: team.orgId }, "team:read");

      const members = teamMembersTable();
      const users = usersTable();

      // Same shape as listOrgMembers: one joined, cursor-paginated query
      // rather than a membership select followed by an inArray user fetch,
      // so a 100-member team (this task's own verify line) does not turn
      // into two round trips whose second one grows with the roster.
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        members,
        eq((members as any).teamId, parsed.teamId),
        parsed.page,
        {
          filterColumn: [(users as any).name, (users as any).email],
          sortableColumns: {
            name: (users as any).name,
            email: (users as any).email,
            joinedAt: (members as any).joinedAt,
          },
          select: {
            userId: (users as any).id,
            email: (users as any).email,
            name: (users as any).name,
            joinedAt: (members as any).joinedAt,
          },
          join: { table: users, on: eq((members as any).userId, (users as any).id) },
          // team_members is keyed on (teamId, userId) and has no `id`, same
          // reasoning as listOrgMembers' idColumn/idField choice.
          idColumn: (users as any).id,
          idField: "userId",
          defaultSort: { field: "joinedAt", column: (members as any).joinedAt },
        },
      );

      return {
        members: items.map((m: any) => ({
          userId: m.userId,
          email: m.email ?? "",
          name: m.name ?? "",
          joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
  };
};
