import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { eq, and, inArray } from "drizzle-orm";
import { executePaginatedQuery } from "../../db/query-builder";
import { requireUser, getProjectOrgId } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

const ListPermissionsSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const ListRolesSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
});

const CreateRoleSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.string().min(1, "name is required").max(256),
  permissionKeys: z.array(z.string()).default([]),
});

const UpdateRoleSchema = z.object({
  roleId: z.string().min(1, "roleId is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  // A proto3 `repeated` field can't distinguish "omitted" from "sent
  // empty" the way an optional scalar can - an empty array here always
  // means "replace with no permissions", never "leave unchanged". Every
  // client that only means to rename a role must resend its current
  // permissionKeys, the same way the GUI's matrix always sends the full
  // set it renders (see UpdateRoleRequest's own contract comment).
  permissionKeys: z.array(z.string()).optional(),
});

const DeleteRoleSchema = z.object({
  roleId: z.string().min(1, "roleId is required"),
});

const ScopeTypeSchema = z.enum(["organization", "team", "project"]);

const GrantRoleSchema = z.object({
  subjectType: z.enum(["user", "team"]),
  subjectId: z.string().min(1, "subjectId is required"),
  scopeType: ScopeTypeSchema,
  scopeId: z.string().min(1, "scopeId is required"),
  roleId: z.string().min(1, "roleId is required"),
});

const RevokeGrantSchema = z.object({
  grantId: z.string().min(1, "grantId is required"),
});

const ListGrantsSchema = z.object({
  scopeType: ScopeTypeSchema,
  scopeId: z.string().min(1, "scopeId is required"),
  page: z.any().optional(),
});

// --- Handler Factory ---

/**
 * Role, permission and grant management (M10-T11, ADR-0013). Not named in
 * the milestone's own plan as a backend task - T11's file list named only
 * `apps/gui/src/features/Roles/` - but the GUI cannot exist without
 * something to call: T07/T08's PROGRESS notes already flagged that nothing
 * anywhere in the product could create a `grants` row through an RPC.
 * This closes that gap.
 */
export const createRolesHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  const permissionsTable = () => (isStandalone ? schemaSqlite.permissions : schemaMysql.permissions);
  const rolesTable = () => (isStandalone ? schemaSqlite.roles : schemaMysql.roles);
  const rolePermissionsTable = () => (isStandalone ? schemaSqlite.rolePermissions : schemaMysql.rolePermissions);
  const grantsTable = () => (isStandalone ? schemaSqlite.grants : schemaMysql.grants);
  const teamsTable = () => (isStandalone ? schemaSqlite.teams : schemaMysql.teams);
  const usersTable = () => (isStandalone ? schemaSqlite.users : schemaMysql.users);

  /**
   * Every grant names a `scopeType`/`scopeId`, not an `orgId` directly -
   * this resolves the organization that actually administers it, the same
   * way `getTaskOrgId`/`getFolderOrgId` resolve upward through a resource
   * hierarchy elsewhere in this codebase. `can()`'s own ancestor-org
   * climbing (T09) then takes over from there, so an admin of any ancestor
   * of the resolved org passes too.
   */
  const resolveScopeOrgId = async (scopeType: string, scopeId: string): Promise<string> => {
    if (scopeType === "organization") return scopeId;
    if (scopeType === "project") return getProjectOrgId(db, scopeId, true);
    const rows = await db.select({ orgId: teamsTable().orgId }).from(teamsTable()).where(eq((teamsTable() as any).id, scopeId)).limit(1);
    if (!rows || rows.length === 0) throw new ConnectError("team not found", Code.NotFound);
    return rows[0].orgId;
  };

  const loadRole = async (roleId: string) => {
    const rows = await db.select().from(rolesTable()).where(eq((rolesTable() as any).id, roleId)).limit(1);
    if (!rows || rows.length === 0) throw new ConnectError("role not found", Code.NotFound);
    return rows[0];
  };

  const permissionKeysForRoles = async (roleIds: string[]): Promise<Map<string, string[]>> => {
    const byRole = new Map<string, string[]>(roleIds.map((id) => [id, []]));
    if (roleIds.length === 0) return byRole;
    const rows = await db.select().from(rolePermissionsTable()).where(inArray((rolePermissionsTable() as any).roleId, roleIds));
    for (const r of rows) byRole.get(r.roleId)?.push(r.permissionKey);
    return byRole;
  };

  const toWireRole = (role: any, permissionKeys: string[]) => ({
    id: role.id,
    orgId: role.orgId ?? "",
    name: role.name,
    isSystem: !!role.isSystem,
    permissionKeys,
    createdAt: role.createdAt instanceof Date ? role.createdAt.toISOString() : role.createdAt,
  });

  return {
    async listPermissions(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListPermissionsSchema.parse(req);
      // Read-only reference data, identical for every org - gated on
      // membership (org:read) purely so an outsider can't probe it, not
      // because the answer would ever differ by org.
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "org:read");

      const rows = await db.select().from(permissionsTable()).orderBy((permissionsTable() as any).key);
      return { permissions: rows.map((p: any) => ({ key: p.key, description: p.description })) };
    },

    async listRoles(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListRolesSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "org:read");

      const roles = rolesTable();
      // System roles (org_id NULL, shared by every org) plus this org's own
      // custom ones - not a single `orgId = X OR orgId IS NULL` filter
      // because executePaginatedQuery's cursor pagination assumes one
      // simple equality/ordering shape; two queries merged in memory is
      // simpler and correct at this scale (system roles are always exactly
      // four, custom roles per org realistically number in the hundreds,
      // matching this task's own "100 roles" verify line, not thousands).
      const systemRoles = await db.select().from(roles).where(eq((roles as any).isSystem, true));
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db, roles, eq((roles as any).orgId, parsed.orgId), parsed.page,
        {
          filterColumn: (roles as any).name,
          sortableColumns: { name: (roles as any).name, createdAt: (roles as any).createdAt },
        },
      );

      const allRoles = parsed.page?.cursor ? items : [...systemRoles, ...items];
      const permsByRole = await permissionKeysForRoles(allRoles.map((r: any) => r.id));
      return {
        roles: allRoles.map((r: any) => toWireRole(r, permsByRole.get(r.id) ?? [])),
        // System roles are prepended only on the first page, so they are
        // not counted again in totalCount (which paginates the custom-role
        // query alone) - a second page's count would otherwise imply more
        // custom roles exist than actually do.
        page: { nextCursor, totalCount: (totalCount ?? 0) + (parsed.page?.cursor ? 0 : systemRoles.length) },
      };
    },

    async createRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = CreateRoleSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "role:manage");

      if (parsed.permissionKeys.length > 0) {
        const existing = await db.select({ key: (permissionsTable() as any).key }).from(permissionsTable())
          .where(inArray((permissionsTable() as any).key, parsed.permissionKeys));
        const validKeys = new Set(existing.map((p: any) => p.key));
        const unknown = parsed.permissionKeys.filter((k) => !validKeys.has(k));
        if (unknown.length > 0) {
          throw new ConnectError(`unknown permission key(s): ${unknown.join(", ")}`, Code.InvalidArgument);
        }
      }

      const newId = `role-${crypto.randomUUID()}`;
      const payload = { id: newId, orgId: parsed.orgId, name: parsed.name, isSystem: false, createdAt: new Date() };
      await db.insert(rolesTable()).values(payload);
      for (const key of parsed.permissionKeys) {
        await db.insert(rolePermissionsTable()).values({ roleId: newId, permissionKey: key });
      }

      publishDomainEvent(nc, "domain.role.created", { ...payload, permissionKeys: parsed.permissionKeys });
      return { role: toWireRole(payload, parsed.permissionKeys) };
    },

    async updateRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateRoleSchema.parse(req);
      const existing = await loadRole(parsed.roleId);
      if (existing.isSystem) {
        throw new ConnectError("system roles are immutable", Code.PermissionDenied);
      }
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing.orgId }, "role:manage");

      if (parsed.name !== undefined) {
        await db.update(rolesTable()).set({ name: parsed.name }).where(eq((rolesTable() as any).id, parsed.roleId));
      }
      if (parsed.permissionKeys !== undefined) {
        if (parsed.permissionKeys.length > 0) {
          const rows = await db.select({ key: (permissionsTable() as any).key }).from(permissionsTable())
            .where(inArray((permissionsTable() as any).key, parsed.permissionKeys));
          const validKeys = new Set(rows.map((p: any) => p.key));
          const unknown = parsed.permissionKeys.filter((k) => !validKeys.has(k));
          if (unknown.length > 0) {
            throw new ConnectError(`unknown permission key(s): ${unknown.join(", ")}`, Code.InvalidArgument);
          }
        }
        await db.delete(rolePermissionsTable()).where(eq((rolePermissionsTable() as any).roleId, parsed.roleId));
        for (const key of parsed.permissionKeys) {
          await db.insert(rolePermissionsTable()).values({ roleId: parsed.roleId, permissionKey: key });
        }
      }

      const updated = { ...existing, name: parsed.name ?? existing.name };
      const permissionKeys = parsed.permissionKeys ?? (await permissionKeysForRoles([parsed.roleId])).get(parsed.roleId) ?? [];
      publishDomainEvent(nc, "domain.role.updated", { ...updated, permissionKeys });
      return { role: toWireRole(updated, permissionKeys) };
    },

    async deleteRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = DeleteRoleSchema.parse(req);
      const existing = await loadRole(parsed.roleId);
      if (existing.isSystem) {
        throw new ConnectError("system roles cannot be deleted", Code.PermissionDenied);
      }
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: existing.orgId }, "role:manage");

      // Refuse rather than cascade: a grant referencing this role is
      // someone's live access, and silently revoking it as a side effect
      // of deleting the role definition is the kind of surprise
      // purgeProject/purgeOrg's own "still has X - remove them first"
      // guards exist to prevent elsewhere in this codebase.
      const inUse = await db.select().from(grantsTable()).where(eq((grantsTable() as any).roleId, parsed.roleId)).limit(1);
      if (inUse.length > 0) {
        throw new ConnectError("role is still granted to a subject - revoke those grants first", Code.FailedPrecondition);
      }

      await db.delete(rolePermissionsTable()).where(eq((rolePermissionsTable() as any).roleId, parsed.roleId));
      await db.delete(rolesTable()).where(eq((rolesTable() as any).id, parsed.roleId));

      publishDomainEvent(nc, "domain.role.deleted", { roleId: parsed.roleId });
      return { success: true };
    },

    async grantRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = GrantRoleSchema.parse(req);
      const orgId = await resolveScopeOrgId(parsed.scopeType, parsed.scopeId);
      // Granting or revoking access is an organization-administrative act
      // regardless of which scope the grant itself targets - the same
      // authority updateOrgMemberRole/inviteUser already require, not
      // role:manage (which governs a role's *definition*, not who holds
      // it).
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "org:admin");

      const role = await loadRole(parsed.roleId);
      // A custom role belongs to exactly the org that created it - not
      // reusable across organizations, the same boundary a project
      // template's rootTaskTypeId already enforces (projects.handler.ts).
      // A system role (orgId null) has no such boundary.
      if (role.orgId && role.orgId !== orgId) {
        throw new ConnectError("role belongs to a different organization", Code.InvalidArgument);
      }

      if (parsed.subjectType === "user") {
        const rows = await db.select().from(usersTable()).where(eq((usersTable() as any).id, parsed.subjectId)).limit(1);
        if (!rows || rows.length === 0) throw new ConnectError("user not found", Code.NotFound);
      } else {
        const rows = await db.select().from(teamsTable()).where(eq((teamsTable() as any).id, parsed.subjectId)).limit(1);
        if (!rows || rows.length === 0) throw new ConnectError("team not found", Code.NotFound);
      }

      const existing = await db.select().from(grantsTable()).where(and(
        eq((grantsTable() as any).subjectType, parsed.subjectType),
        eq((grantsTable() as any).subjectId, parsed.subjectId),
        eq((grantsTable() as any).scopeType, parsed.scopeType),
        eq((grantsTable() as any).scopeId, parsed.scopeId),
        eq((grantsTable() as any).roleId, parsed.roleId),
      )).limit(1);
      if (existing.length > 0) {
        return { grant: { ...existing[0], roleName: role.name, createdAt: existing[0].createdAt instanceof Date ? existing[0].createdAt.toISOString() : existing[0].createdAt } };
      }

      const newId = `grant-${crypto.randomUUID()}`;
      const payload = {
        id: newId, subjectType: parsed.subjectType, subjectId: parsed.subjectId,
        scopeType: parsed.scopeType, scopeId: parsed.scopeId, roleId: parsed.roleId, createdAt: new Date(),
      };
      await db.insert(grantsTable()).values(payload);

      publishDomainEvent(nc, "domain.grant.created", payload);
      return { grant: { ...payload, roleName: role.name, createdAt: payload.createdAt.toISOString() } };
    },

    async revokeGrant(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RevokeGrantSchema.parse(req);
      const rows = await db.select().from(grantsTable()).where(eq((grantsTable() as any).id, parsed.grantId)).limit(1);
      if (!rows || rows.length === 0) throw new ConnectError("grant not found", Code.NotFound);
      const grant = rows[0];
      const orgId = await resolveScopeOrgId(grant.scopeType, grant.scopeId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "org:admin");

      await db.delete(grantsTable()).where(eq((grantsTable() as any).id, parsed.grantId));

      publishDomainEvent(nc, "domain.grant.revoked", { grantId: parsed.grantId });
      return { success: true };
    },

    async listGrants(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListGrantsSchema.parse(req);
      const orgId = await resolveScopeOrgId(parsed.scopeType, parsed.scopeId);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: orgId }, "org:admin");

      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db, grantsTable(),
        and(eq((grantsTable() as any).scopeType, parsed.scopeType), eq((grantsTable() as any).scopeId, parsed.scopeId)),
        parsed.page,
        { sortableColumns: { createdAt: (grantsTable() as any).createdAt }, defaultSort: { field: "createdAt", column: (grantsTable() as any).createdAt } },
      );

      const roleIds = [...new Set(items.map((g: any) => g.roleId))];
      const roleRows = roleIds.length > 0
        ? await db.select().from(rolesTable()).where(inArray((rolesTable() as any).id, roleIds))
        : [];
      const roleName = new Map(roleRows.map((r: any) => [r.id, r.name]));

      return {
        grants: items.map((g: any) => ({
          id: g.id,
          subjectType: g.subjectType,
          subjectId: g.subjectId,
          scopeType: g.scopeType,
          scopeId: g.scopeId,
          roleId: g.roleId,
          roleName: roleName.get(g.roleId) ?? g.roleId,
          createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
  };
};
