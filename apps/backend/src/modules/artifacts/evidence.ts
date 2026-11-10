import { and, eq, inArray, isNull, sql, type SQLWrapper } from 'drizzle-orm';
import * as sqlite from '../../db/schema.sqlite';
import * as mysql from '../../db/schema.mysql';
import type { Principal } from '../auth/session';

/** Exact UTF-8 storage length without transferring the stored body. */
export function storedBytesSql(column: SQLWrapper, standalone: boolean) {
  return standalone
    ? sql<number>`coalesce(length(cast(${column} as blob)), 0)`
    : sql<number>`coalesce(octet_length(${column}), 0)`;
}

export { contentPrefixSql, decodeContentPrefix } from '../../lib/textPrefix';

/** Bun SQLite text binding consumes a leading BOM; binary binding preserves it. */
export function artifactContentValue(content: string, standalone: boolean) {
  return standalone && content.startsWith('\uFEFF')
    ? sql`cast(${Buffer.from(content, 'utf8')} as text)` : content;
}

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;

export function linkToWire(row: any, artifactName?: string, taskTitle?: string) {
  const linkedBy = ['user', 'agent'].includes(row.linkedByKind) && row.linkedById
    ? { kind: row.linkedByKind, id: row.linkedById, name: row.linkedByName ?? row.linkedById } : undefined;
  return {
    id: row.id, taskId: row.taskId, artifactId: row.artifactId,
    ...(artifactName !== undefined ? { artifactName } : {}),
    ...(taskTitle !== undefined ? { taskTitle } : {}),
    ...(row.linkedAt ? { linkedAt: iso(row.linkedAt) } : {}),
    ...(linkedBy ? { linkedBy } : {}),
  };
}

export async function linkActor(db: any, standalone: boolean, principal: Principal) {
  const S = standalone ? sqlite : mysql;
  const table = principal.kind === 'agent' ? S.agents : S.users;
  const id = principal.kind === 'agent' ? principal.agentId : principal.userId;
  const [actor] = await db.select({ name: table.name }).from(table).where(eq(table.id, id)).limit(1);
  return { linkedByKind: principal.kind, linkedById: id, linkedByName: actor?.name ?? id };
}

/** Caller caps raw links first. No body or unbounded source/name lookup here. */
export async function evidenceMetadata(db: any, standalone: boolean, orgId: string, rows: any[]) {
  if (!rows.length) return { links: [], evidence: [] };
  const S = standalone ? sqlite : mysql;
  const a = S.artifacts, f = S.folders, p = S.projects, t = S.tasks;
  const artifactIds = [...new Set<string>(rows.map(row => row.artifactId))];
  const taskIds = [...new Set<string>(rows.map(row => row.taskId))];
  const artifacts = await db.select({
    id: a.id, name: a.name, contentType: a.contentType,
    storedBytes: storedBytesSql(a.content, standalone), createdAt: a.createdAt,
    deletedAt: a.deletedAt, folderDeletedAt: f.deletedAt,
  }).from(a).innerJoin(f, eq(a.folderId, f.id)).innerJoin(p, eq(f.projectId, p.id))
    .where(and(inArray(a.id, artifactIds), eq(p.orgId, orgId), isNull(p.deletedAt)));
  const tasks = await db.select({ id: t.id, title: t.title }).from(t)
    .innerJoin(p, eq(t.projectId, p.id))
    .where(and(inArray(t.id, taskIds), eq(p.orgId, orgId), isNull(p.deletedAt)));
  const byArtifact = new Map<string, any>(artifacts.map((artifact: any) => [artifact.id, artifact]));
  const byTask = new Map<string, any>(tasks.map((task: any) => [task.id, task]));
  const evidence = rows.map(row => {
    const artifact = byArtifact.get(row.artifactId);
    const link = linkToWire(row, artifact?.name ?? 'Artifact unavailable', byTask.get(row.taskId)?.title ?? 'Task unavailable');
    return artifact ? {
      link, availability: artifact.deletedAt || artifact.folderDeletedAt ? 'archived' : 'available',
      contentType: artifact.contentType, storedBytes: BigInt(artifact.storedBytes), artifactCreatedAt: iso(artifact.createdAt),
    } : { link, availability: 'unavailable' };
  });
  return { links: evidence.map(item => item.link), evidence };
}
