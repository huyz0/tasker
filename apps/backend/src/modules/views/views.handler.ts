import { createHash } from 'node:crypto';
import { z } from 'zod/v4';
import { Code, ConnectError } from '@connectrpc/connect';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import * as sqlite from '../../db/schema.sqlite';
import * as mysql from '../../db/schema.mysql';
import { executePaginatedQuery } from '../../db/query-builder';
import { requireUser } from '../../lib/authz';
import { assertCan, can } from '../../lib/policy';
import { DefinitionSchema, readDefinition, ScreenSchema, VisibilitySchema, ViewNameSchema } from './definition';

const id = z.string().min(1).max(256);
const IdSchema = z.object({ viewId: id });
const CreateSchema = z.object({ projectId: id, name: ViewNameSchema, visibility: VisibilitySchema.optional().default('personal'), definition: DefinitionSchema });
const RenameSchema = IdSchema.extend({ name: ViewNameSchema });
const ListSchema = z.object({ orgId: id, screen: ScreenSchema, visibility: VisibilitySchema.optional(), page: z.object({
  limit: z.number().int().optional(), cursor: z.string().max(4096).optional(), filter: z.string().max(500).optional(), sort: z.string().max(64).optional(),
}).optional() });
const nameKey = (name: string) => createHash('sha256').update(name.toLowerCase()).digest('hex');
const notFound = () => new ConnectError('saved view not found', Code.NotFound);
const unavailable = () => new ConnectError('This saved view is unavailable. Keep your current view or save a new definition.', Code.FailedPrecondition);

// Match this constraint, including wrapped driver causes; do not turn every
// database failure into a successful-looking name conflict or expose SQL.
function isNameConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const item = current as { message?: unknown; cause?: unknown };
    const message = String(item.message ?? '');
    if (message.includes('saved_views_name_idx') || (message.includes('UNIQUE constraint failed: saved_views.') && message.includes('name_key'))) return true;
    current = item.cause;
  }
  return false;
}

/** Human bookmark configuration; query/name contents have no organization event. */
export function createSavedViewsHandler(db: any) {
  const standalone = process.env.STANDALONE === 'true';
  const S = standalone ? sqlite : mysql;
  const table = S.savedViews;
  const principal = (userId: string) => ({ kind: 'user' as const, userId });
  const orgScope = (orgId: string) => ({ type: 'organization' as const, id: orgId });
  const projectScope = (projectId: string) => ({ type: 'project' as const, id: projectId });
  const find = async (viewId: string, current = false) => {
    const query = db.select().from(table).where(eq(table.id, viewId)).limit(1);
    // Writes run inside the runtime mutation unit. A current locking read
    // serializes rename/delete rather than acknowledging an obsolete snapshot.
    return (await (current && !standalone ? query.for('update') : query))[0];
  };
  const project = async (projectId: string, orgId?: string) => (await db.select({ id: S.projects.id, orgId: S.projects.orgId })
    .from(S.projects).where(and(eq(S.projects.id, projectId), isNull(S.projects.deletedAt), orgId ? eq(S.projects.orgId, orgId) : undefined)).limit(1))[0];

  async function authorized(viewId: string, userId: string, current = false) {
    const row = await find(viewId, current);
    if (!row || !['personal', 'organization'].includes(row.visibility)
      || (row.visibility === 'personal' && row.ownerUserId !== userId)
      || !await can(db, principal(userId), orgScope(row.orgId), 'org:read')) throw notFound();
    return row;
  }
  async function authorizeEdit(row: any, userId: string) {
    if (row.visibility === 'organization') await assertCan(db, principal(userId), orgScope(row.orgId), 'org:admin');
  }
  async function authorizeSource(userId: string, orgId: string, projectId: string, screen: string) {
    await assertCan(db, principal(userId), screen === 'tasks' ? orgScope(orgId) : projectScope(projectId), screen === 'tasks' ? 'task:read' : 'dashboard:read');
  }

  async function metadata(rows: any[], userId: string, orgId: string, exactProjectPermission = false) {
    if (!rows.length) return [];
    const [admin, orgProjectNames] = await Promise.all([
      can(db, principal(userId), orgScope(orgId), 'org:admin'),
      can(db, principal(userId), orgScope(orgId), 'project:read'),
    ]);
    // An organization-level project-read grant reaches every project. Otherwise
    // omit optional names from lists; a single explicit Get can check its exact
    // project grant without turning a100-row page into100 permission reads.
    const names = orgProjectNames || (exactProjectPermission && rows.length === 1
      && await can(db, principal(userId), projectScope(rows[0].projectId), 'project:read'));
    const ids = [...new Set(rows.map(row => row.projectId))];
    const projects = await db.select({ id: S.projects.id, ...(names ? { name: S.projects.name } : {}) })
      .from(S.projects).where(and(inArray(S.projects.id, ids), eq(S.projects.orgId, orgId), isNull(S.projects.deletedAt)));
    const active = new Map<string, any>(projects.map((item: any) => [item.id, item]));
    return rows.map(row => {
      const ownerProject = active.get(row.projectId);
      const reason = !ownerProject ? 'project_unavailable' : !readDefinition(row) ? 'definition_invalid' : undefined;
      return {
        id: row.id, orgId: row.orgId, projectId: row.projectId, ownerUserId: row.ownerUserId,
        name: row.name, screen: row.screen, visibility: row.visibility,
        canEdit: row.visibility === 'personal' ? row.ownerUserId === userId : admin,
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        ...(ownerProject?.name ? { projectName: ownerProject.name } : {}), ...(reason ? { unavailableReason: reason } : {}),
      };
    });
  }

  return {
    async createSavedView(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values), parsed = CreateSchema.parse(req);
      const target = await project(parsed.projectId);
      if (!target || !await can(db, principal(userId), orgScope(target.orgId), 'org:read')) throw new ConnectError('project not found', Code.NotFound);
      await authorizeSource(userId, target.orgId, target.id, parsed.definition.screen);
      if (parsed.visibility === 'organization') await assertCan(db, principal(userId), orgScope(target.orgId), 'org:admin');
      const now = new Date(), viewId = `svw-${crypto.randomUUID()}`;
      try {
        await db.insert(table).values({
          id: viewId, orgId: target.orgId, projectId: target.id, ownerUserId: userId, name: parsed.name,
          nameKey: nameKey(parsed.name), audienceKey: parsed.visibility === 'personal' ? `user:${userId}` : 'organization',
          screen: parsed.definition.screen, visibility: parsed.visibility, definitionJson: JSON.stringify(parsed.definition), createdAt: now, updatedAt: now,
        });
      } catch (error) {
        if (!isNameConflict(error)) throw error;
        throw new ConnectError('A saved view with this name already exists in this audience.', Code.AlreadyExists);
      }
      return { view: (await metadata([await find(viewId)], userId, target.orgId, true))[0] };
    },
    async getSavedView(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values), parsed = IdSchema.parse(req), row = await authorized(parsed.viewId, userId);
      const definition = readDefinition(row);
      if (!definition || !await project(row.projectId, row.orgId)) throw unavailable();
      await authorizeSource(userId, row.orgId, row.projectId, row.screen);
      return { view: (await metadata([row], userId, row.orgId, true))[0], definition };
    },
    async listSavedViews(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values), parsed = ListSchema.parse(req);
      await assertCan(db, principal(userId), orgScope(parsed.orgId), 'org:read');
      const visible = and(eq(table.orgId, parsed.orgId), eq(table.screen, parsed.screen),
        or(and(eq(table.visibility, 'personal'), eq(table.ownerUserId, userId)), eq(table.visibility, 'organization')),
        parsed.visibility ? eq(table.visibility, parsed.visibility) : undefined);
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, table, visible, parsed.page, {
        filterColumn: table.name, sortableColumns: { name: table.name, createdAt: table.createdAt },
        cursorScope: JSON.stringify(['savedViews', userId, parsed.orgId, parsed.screen, parsed.visibility ?? 'all']),
        select: { id: table.id, orgId: table.orgId, projectId: table.projectId, ownerUserId: table.ownerUserId,
          name: table.name, screen: table.screen, visibility: table.visibility, createdAt: table.createdAt, updatedAt: table.updatedAt, definitionJson: table.definitionJson },
      });
      return { views: await metadata(items, userId, parsed.orgId), page: { nextCursor, totalCount } };
    },
    async renameSavedView(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values), parsed = RenameSchema.parse(req), row = await authorized(parsed.viewId, userId, true);
      await authorizeEdit(row, userId);
      try {
        await db.update(table).set({ name: parsed.name, nameKey: nameKey(parsed.name), updatedAt: new Date() }).where(eq(table.id, row.id));
      } catch (error) {
        if (!isNameConflict(error)) throw error;
        throw new ConnectError('A saved view with this name already exists in this audience.', Code.AlreadyExists);
      }
      return { view: (await metadata([await find(row.id)], userId, row.orgId))[0] };
    },
    async deleteSavedView(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values), parsed = IdSchema.parse(req), row = await authorized(parsed.viewId, userId, true);
      await authorizeEdit(row, userId);await db.delete(table).where(eq(table.id, row.id));
      return { success: true };
    },
  };
}
