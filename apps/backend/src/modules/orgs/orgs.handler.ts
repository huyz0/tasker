import { publishDomainEvent } from "../../lib/natsCorrelation";
import { z } from "zod/v4";
import { inArray, eq, and, not } from "drizzle-orm";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { insertRecord, executePaginatedQuery, notDeleted, softDeleteById, restoreById } from "../../db/query-builder";
import { requireUser, assertOrgAdmin, assertOrgMember, getOrgMemberRole, countOrgOwners } from "../../lib/authz";
import { ConnectError, Code } from "@connectrpc/connect";

// --- Zod Request Schemas ---

// Ownership isn't handed out through an invite - only an existing owner can
// grant it via updateOrgMemberRole - so 'owner' is deliberately excluded here.
const InvitableRole = z.enum(['admin', 'member', 'viewer']);
const OrgRole = z.enum(['owner', 'admin', 'member', 'viewer']);

const SeedOrgSchema = z.object({
  name: z.string().min(1, "name is required").max(256),
  slug: z.string().min(1, "slug is required").max(256),
  parentOrgId: z.string().nullable().optional(),
});

const InviteUserSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  email: z.string().email("valid email is required"),
  role: InvitableRole.default('member'),
});

const ArchiveOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const RestoreOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const PurgeOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
});

const SetOrgRetentionDaysSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  binRetentionDays: z.number().int().min(1, "binRetentionDays must be at least 1").max(3650, "binRetentionDays must be at most 3650 (10 years)"),
});

const UpdateOrgSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  name: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
  slug: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).max(256).optional()),
}).refine((v) => v.name !== undefined || v.slug !== undefined, {
  message: "at least one of name or slug must be provided",
});

const ListInvitationsSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
});

const RevokeInvitationSchema = z.object({
  invitationId: z.string().min(1, "invitationId is required"),
});

const ListOrgMembersSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  page: z.any().optional(),
  // Empty string means "no facet" rather than "a member with no role" - the
  // GUI's <select> sends "" for its All option, and treating that as a value
  // would return nothing at all.
  role: z.preprocess((v) => (v === "" ? undefined : v), OrgRole.optional()),
});

const RemoveOrgMemberSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  userId: z.string().min(1, "userId is required"),
});

const UpdateOrgMemberRoleSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  userId: z.string().min(1, "userId is required"),
  role: OrgRole,
});

/**
 * How long an invitation stays redeemable. Two weeks is long enough to survive
 * a holiday and short enough that a forgotten invite is not a standing key to
 * the organization.
 */
export const INVITATION_TTL_DAYS = 14;

const invitationExpiry = (from: Date = new Date()) =>
  new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

// --- Handler Factory ---

export const createOrgsHandler = (db: any, nc: any = null) => {
  const isStandalone = process.env.STANDALONE === "true";
  return {
    async listOrgs(req: any, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

      const memberRows = await db.select().from(members).where(inArray(members.userId, [userId]));
      const memberOrgIds = memberRows.map((m: any) => m.orgId);
      if (memberOrgIds.length === 0) {
        return { organizations: [], ancestors: [], page: {} };
      }

      const deletedFilter = req.onlyDeleted ? not(notDeleted(orgs)) : notDeleted(orgs);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, orgs, and(inArray(orgs.id, memberOrgIds), deletedFilter), req.page, (orgs as any).name, { name: (orgs as any).name, createdAt: (orgs as any).createdAt });

      // The client nests by parentOrgId. A child whose parent landed on a
      // different page therefore has nothing to hang off, and disappears from
      // the tree entirely rather than rendering at the wrong depth - it is in
      // the response and never drawn. Send the missing parents alongside.
      //
      // Restricted to organizations the caller is already a member of. Someone
      // can be a member of a sub-organization without being a member of its
      // parent, and this is a pagination fix, not a change to who may see what.
      const loadedIds = new Set(items.map((o: any) => o.id));
      const memberOrgIdSet = new Set(memberOrgIds);
      const missingParentIds = [
        ...new Set(
          items
            .map((o: any) => o.parentOrgId)
            .filter((pid: string | null): pid is string => !!pid && !loadedIds.has(pid) && memberOrgIdSet.has(pid)),
        ),
      ];
      const ancestorRows = missingParentIds.length
        ? await db.select().from(orgs).where(inArray((orgs as any).id, missingParentIds))
        : [];

      return {
        ancestors: ancestorRows.map((o: any) => ({
          ...o,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
        })),
        organizations: items.map((o: any) => ({
          ...o,
          createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async seedOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = SeedOrgSchema.parse(req);
      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;

      if (parsed.parentOrgId) {
        const parentRows = await db.select().from(orgs).where(eq((orgs as any).id, parsed.parentOrgId)).limit(1);
        if (!parentRows || parentRows.length === 0) {
          throw new ConnectError("parent organization not found", Code.NotFound);
        }
        if (parentRows[0].parentOrgId) {
          throw new ConnectError("nested sub-organizations are not supported yet", Code.InvalidArgument);
        }
        await assertOrgAdmin(db, userId, parsed.parentOrgId);
      }

      const newOrgId = `o-${crypto.randomUUID()}`;
      const orgPayload = { id: newOrgId, name: parsed.name, slug: parsed.slug, parentOrgId: parsed.parentOrgId || null };

      await insertRecord(db, orgs, orgPayload, isStandalone);
      // The founding member becomes owner (not just admin) - every org must
      // always have at least one owner, and there's no simpler moment to
      // guarantee that than at creation.
      const memberPayload = { orgId: newOrgId, userId, role: "owner" };
      await insertRecord(db, members, memberPayload, isStandalone, "joinedAt");

      publishDomainEvent(nc, "domain.org.created", orgPayload);
      return { organization: { ...orgPayload, role: "owner" } };
    },
    async updateOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const existing = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("organization not found", Code.NotFound);

      const updates: Record<string, unknown> = {};
      if (parsed.name !== undefined) updates.name = parsed.name;
      if (parsed.slug !== undefined) updates.slug = parsed.slug;

      try {
        await db.update(orgs).set(updates).where(eq((orgs as any).id, parsed.orgId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("UNIQUE constraint failed") || msg.includes("Duplicate entry")) {
          throw new ConnectError("an organization with this slug already exists", Code.AlreadyExists);
        }
        throw err;
      }

      const updated = { ...existing[0], ...updates };
      publishDomainEvent(nc, "domain.org.updated", updated);
      return { organization: updated };
    },
    /**
     * Invitations were write-only: an admin could send one and then had no way
     * to see it, let alone withdraw it. Admin-gated, because the list is every
     * address someone has been asked to hand over.
     */
    async listInvitations(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListInvitationsSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        invs,
        eq((invs as any).orgId, parsed.orgId),
        parsed.page,
        (invs as any).email,
        { email: (invs as any).email, role: (invs as any).role, createdAt: (invs as any).createdAt },
      );

      const now = Date.now();
      return {
        invitations: items.map((i: any) => ({
          id: i.id,
          orgId: i.orgId,
          email: i.email,
          role: i.role,
          invitedBy: i.invitedBy,
          createdAt: i.createdAt instanceof Date ? i.createdAt.toISOString() : i.createdAt,
          expiresAt: i.expiresAt instanceof Date ? i.expiresAt.toISOString() : (i.expiresAt ?? undefined),
          // Computed server-side rather than left to each client to derive
          // from a timestamp: an invitation lapsing is the single fact this
          // list exists to show, and three clients comparing dates in three
          // timezones will eventually disagree about it.
          expired: !!i.expiresAt && new Date(i.expiresAt).getTime() <= now,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async revokeInvitation(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RevokeInvitationSchema.parse(req);

      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const existing = await db.select().from(invs).where(eq((invs as any).id, parsed.invitationId)).limit(1);
      if (!existing || existing.length === 0) {
        throw new ConnectError("invitation not found", Code.NotFound);
      }
      // Scope from the row, not the request. A caller who sent their own orgId
      // could otherwise name an organization they administer while pointing the
      // id at an invitation in one they do not.
      await assertOrgAdmin(db, userId, existing[0].orgId);

      await db.delete(invs).where(eq((invs as any).id, parsed.invitationId));

      publishDomainEvent(nc, "domain.org.invitation_revoked", {
        orgId: existing[0].orgId,
        invitationId: parsed.invitationId,
        email: existing[0].email,
      });
      return { success: true };
    },
    async listOrgMembers(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ListOrgMembersSchema.parse(req);
      await assertOrgMember(db, userId, parsed.orgId);

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const users = isStandalone ? schemaSqlite.users : schemaMysql.users;

      // This used to select every membership row and then fetch the users with
      // `inArray(users.id, userIds)` - one bound parameter per member. Past
      // SQLite's variable limit that throws outright, and below it the endpoint
      // still returned the entire organization in one response.
      //
      // One joined, cursor-paginated query instead. The join is inner: a
      // membership whose user row is missing is not a person anyone can act on,
      // and surfacing it as a blank-named row only produces a support question.
      const roleFacet = parsed.role ? eq((members as any).role, parsed.role) : undefined;

      const { items, nextCursor, totalCount } = await executePaginatedQuery(
        db,
        members,
        roleFacet
          ? and(eq((members as any).orgId, parsed.orgId), roleFacet)
          : eq((members as any).orgId, parsed.orgId),
        parsed.page,
        [(users as any).name, (users as any).email],
        {
          name: (users as any).name,
          email: (users as any).email,
          role: (members as any).role,
          joinedAt: (members as any).joinedAt,
        },
        {
          select: {
            userId: (users as any).id,
            email: (users as any).email,
            name: (users as any).name,
            role: (members as any).role,
            joinedAt: (members as any).joinedAt,
          },
          join: { table: users, on: eq((members as any).userId, (users as any).id) },
          // organization_members is keyed on (orgId, userId) and has no `id`,
          // so the cursor's tiebreak is the user id.
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
          role: m.role,
        })),
        page: { nextCursor, totalCount },
      };
    },
    async removeOrgMember(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RemoveOrgMemberSchema.parse(req);

      // Authorization turns on the *target*, not the caller's role. Removing
      // somebody else is an administrative act; removing yourself is leaving,
      // which any member may do - including a viewer, since it changes nothing
      // about the organization except your own presence in it.
      //
      // This previously rejected self-removal outright, so the only way out of
      // an organization was to ask an admin to do it for you.
      if (parsed.userId === userId) {
        await assertOrgMember(db, userId, parsed.orgId);
      } else {
        await assertOrgAdmin(db, userId, parsed.orgId);
      }

      const targetRole = await getOrgMemberRole(db, parsed.userId, parsed.orgId);
      if (targetRole === "owner" && (await countOrgOwners(db, parsed.orgId)) <= 1) {
        throw new ConnectError("cannot remove the organization's last owner", Code.FailedPrecondition);
      }

      // Removing the membership used to be the whole operation, which left any
      // project they owned pointing at somebody who is no longer in the
      // organization. Nothing surfaced it: the foreign key is still satisfied
      // - the user exists, they are simply not a member - so the project just
      // had an owner who could not be assigned work and did not appear in the
      // member list.
      //
      // Archived projects count. A binned project can be restored, and
      // restoring one into a dangling owner would reintroduce the same state
      // through the back door.
      //
      // The ids are in the message on purpose: "reassign their projects" without
      // saying which ones makes the caller go hunting for them.
      const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const owned = await db
        .select({ id: (projects as any).id })
        .from(projects)
        .where(and(eq((projects as any).orgId, parsed.orgId), eq((projects as any).ownerId, parsed.userId)));
      if (owned.length > 0) {
        const ids = owned.map((p: any) => p.id).join(", ");
        throw new ConnectError(
          `user still owns ${owned.length} project(s) in this organization - reassign them first: ${ids}`,
          Code.FailedPrecondition,
        );
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      await db.delete(members).where(and(eq((members as any).orgId, parsed.orgId), eq((members as any).userId, parsed.userId)));

      publishDomainEvent(nc, "domain.org.member_removed", { orgId: parsed.orgId, userId: parsed.userId });
      return { success: true };
    },
    async updateOrgMemberRole(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = UpdateOrgMemberRoleSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const actorRole = await getOrgMemberRole(db, userId, parsed.orgId);
      const targetRole = await getOrgMemberRole(db, parsed.userId, parsed.orgId);
      if (!targetRole) {
        throw new ConnectError("user is not a member of this organization", Code.NotFound);
      }

      // Only an owner can grant ownership or touch another owner's role -
      // a plain admin can manage admin/member/viewer but not the owner tier.
      if (actorRole !== "owner" && (parsed.role === "owner" || targetRole === "owner")) {
        throw new ConnectError("owner role required to change an owner's role or grant ownership", Code.PermissionDenied);
      }

      if (targetRole === "owner" && parsed.role !== "owner" && (await countOrgOwners(db, parsed.orgId)) <= 1) {
        throw new ConnectError("cannot demote the organization's last owner", Code.FailedPrecondition);
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const users = isStandalone ? schemaSqlite.users : schemaMysql.users;
      await db.update(members).set({ role: parsed.role }).where(and(eq((members as any).orgId, parsed.orgId), eq((members as any).userId, parsed.userId)));

      const userRows = await db.select().from(users).where(eq((users as any).id, parsed.userId)).limit(1);
      publishDomainEvent(nc, "domain.org.member_role_updated", { orgId: parsed.orgId, userId: parsed.userId, role: parsed.role });
      return {
        member: {
          userId: parsed.userId,
          email: userRows[0]?.email ?? "",
          name: userRows[0]?.name ?? "",
          role: parsed.role,
        },
      };
    },
    async inviteUser(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = InviteUserSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const invs = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const existing = await db.select().from(invs)
        .where(and(eq((invs as any).orgId, parsed.orgId), eq((invs as any).email, parsed.email)))
        .limit(1);
      if (existing.length > 0) {
        // Re-inviting stays idempotent for a live invitation, but must renew an
        // expired one - otherwise a lapsed invite becomes permanently
        // un-reissuable, and the admin's only remedy is to delete a row they
        // cannot see. It also renews the role, since re-inviting with a
        // different role is the obvious way to change one's mind.
        const invite = existing[0];
        const isExpired = invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now();
        if (isExpired) {
          await db.update(invs)
            .set({ expiresAt: invitationExpiry(), role: parsed.role, invitedBy: userId })
            .where(eq((invs as any).id, invite.id));
        }
        return { success: true };
      }

      const payload = {
        id: `i-${crypto.randomUUID()}`,
        orgId: parsed.orgId,
        email: parsed.email,
        invitedBy: userId,
        role: parsed.role,
        expiresAt: invitationExpiry(),
      };
      await insertRecord(db, invs, payload, isStandalone);
      return { success: true };
    },
    async archiveOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = ArchiveOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      await softDeleteById(db, orgs, parsed.orgId);

      publishDomainEvent(nc, "domain.org.archived", { orgId: parsed.orgId });
      return { success: true };
    },
    async restoreOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = RestoreOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const orgRows = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      const parentOrgId = orgRows[0]?.parentOrgId;
      if (parentOrgId) {
        const parentRows = await db.select().from(orgs).where(eq((orgs as any).id, parentOrgId)).limit(1);
        if (parentRows[0]?.deletedAt) {
          throw new ConnectError("cannot restore a sub-organization into an archived parent organization - restore the parent first", Code.FailedPrecondition);
        }
      }

      await restoreById(db, orgs, parsed.orgId);

      publishDomainEvent(nc, "domain.org.restored", { orgId: parsed.orgId });
      return { success: true };
    },
    async purgeOrg(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = PurgeOrgSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      const existing = await db.select().from(orgs).where(eq((orgs as any).id, parsed.orgId)).limit(1);
      if (!existing || existing.length === 0) throw new ConnectError("organization not found", Code.NotFound);
      if (!existing[0].deletedAt) {
        throw new ConnectError("organization must be archived before it can be purged", Code.FailedPrecondition);
      }

      const projects = isStandalone ? schemaSqlite.projects : schemaMysql.projects;
      const agents = isStandalone ? schemaSqlite.agents : schemaMysql.agents;
      const childOrgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;

      const [remainingProjects, remainingAgents, remainingChildOrgs] = await Promise.all([
        db.select().from(projects).where(eq((projects as any).orgId, parsed.orgId)),
        db.select().from(agents).where(eq((agents as any).orgId, parsed.orgId)),
        db.select().from(childOrgs).where(eq((childOrgs as any).parentOrgId, parsed.orgId)),
      ]);
      if (remainingProjects.length > 0 || remainingAgents.length > 0 || remainingChildOrgs.length > 0) {
        throw new ConnectError("organization still has projects, agents, or sub-organizations - archive or move them first", Code.FailedPrecondition);
      }

      const members = isStandalone ? schemaSqlite.organizationMembers : schemaMysql.organizationMembers;
      const invitations = isStandalone ? schemaSqlite.invitations : schemaMysql.invitations;
      const taskTypes = isStandalone ? schemaSqlite.taskTypes : schemaMysql.taskTypes;
      const taskStatuses = isStandalone ? schemaSqlite.taskStatuses : schemaMysql.taskStatuses;
      const taskStatusTransitions = isStandalone ? schemaSqlite.taskStatusTransitions : schemaMysql.taskStatusTransitions;
      const projectTemplates = isStandalone ? schemaSqlite.projectTemplates : schemaMysql.projectTemplates;
      const labels = isStandalone ? schemaSqlite.labels : schemaMysql.labels;

      // Seven tables, one unit of work. Run as separate statements, a failure
      // partway - a constraint, a lost connection, a deadlock - left the
      // templates and labels deleted while the org row, its members and its
      // invitations survived: an organization that is neither present nor
      // gone, and that the same code path cannot finish purging.
      //
      // Ordering matters inside the transaction too, because these are deletes
      // against live foreign keys rather than a deferred check:
      // projectTemplates.rootTaskTypeId references taskTypes, so the templates
      // go before the task types they point at.
      //
      // The two dialects need genuinely different code, which is why this is
      // not one shared callback:
      //
      //   bun:sqlite's transaction is SYNCHRONOUS - drizzle hands the callback
      //   to `client.transaction(fn)`, which commits as soon as `fn` returns.
      //   An `async` callback returns a promise immediately, so the COMMIT
      //   lands before a single delete has run and a later throw rolls back
      //   nothing. The sqlite path therefore uses drizzle's sync `.run()` /
      //   `.all()` and contains no `await` at all - even `await 0` would defer
      //   past the commit.
      //
      //   mysql2's transaction is genuinely async and holds one pooled
      //   connection for the duration, so it takes the ordinary awaited form.
      if (isStandalone) {
        db.transaction((tx: any) => {
          tx.delete(projectTemplates).where(eq((projectTemplates as any).orgId, parsed.orgId)).run();
          tx.delete(labels).where(eq((labels as any).orgId, parsed.orgId)).run();

          const orgTaskTypes = tx.select().from(taskTypes).where(eq((taskTypes as any).orgId, parsed.orgId)).all();
          for (const taskType of orgTaskTypes) {
            tx.delete(taskStatusTransitions).where(eq((taskStatusTransitions as any).taskTypeId, taskType.id)).run();
            tx.delete(taskStatuses).where(eq((taskStatuses as any).taskTypeId, taskType.id)).run();
            tx.delete(taskTypes).where(eq((taskTypes as any).id, taskType.id)).run();
          }
          tx.delete(members).where(eq((members as any).orgId, parsed.orgId)).run();
          tx.delete(invitations).where(eq((invitations as any).orgId, parsed.orgId)).run();
          tx.delete(orgs).where(eq((orgs as any).id, parsed.orgId)).run();
        });
      } else {
        await db.transaction(async (tx: any) => {
          await tx.delete(projectTemplates).where(eq((projectTemplates as any).orgId, parsed.orgId));
          await tx.delete(labels).where(eq((labels as any).orgId, parsed.orgId));

          const orgTaskTypes = await tx.select().from(taskTypes).where(eq((taskTypes as any).orgId, parsed.orgId));
          for (const taskType of orgTaskTypes) {
            await tx.delete(taskStatusTransitions).where(eq((taskStatusTransitions as any).taskTypeId, taskType.id));
            await tx.delete(taskStatuses).where(eq((taskStatuses as any).taskTypeId, taskType.id));
            await tx.delete(taskTypes).where(eq((taskTypes as any).id, taskType.id));
          }
          await tx.delete(members).where(eq((members as any).orgId, parsed.orgId));
          await tx.delete(invitations).where(eq((invitations as any).orgId, parsed.orgId));
          await tx.delete(orgs).where(eq((orgs as any).id, parsed.orgId));
        });
      }

      publishDomainEvent(nc, "domain.org.purged", { orgId: parsed.orgId });
      return { success: true };
    },
    async setOrgRetentionDays(req: unknown, { values: contextValues }: { values: any }) {
      const userId = requireUser(contextValues);
      const parsed = SetOrgRetentionDaysSchema.parse(req);
      await assertOrgAdmin(db, userId, parsed.orgId);

      const orgs = isStandalone ? schemaSqlite.organizations : schemaMysql.organizations;
      await db.update(orgs).set({ binRetentionDays: parsed.binRetentionDays }).where(eq((orgs as any).id, parsed.orgId));

      return { success: true };
    },
  };
};
