import { describe, expect, it } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { Code } from '@connectrpc/connect';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { createArtifactsHandler } from './artifacts.handler';
import { currentPrincipalKey } from '../auth/session';
import { traceRows } from '../../test/traceRows';

async function fixture(contents = ['A😀\0éZ']) {
  const { db } = await setupIntegrationTest();
  const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`, projectId = `project-${suffix}`;
  await seedOrgWithAdmin(db, { orgId, userId, name: 'Evidence' });
  await seedProject(db, { orgId, userId, templateId: `template-${suffix}`, projectId, name: 'Evidence project' });
  const folderId = `folder-${suffix}`, taskId = `task-${suffix}`, now = new Date();
  await db.insert(S.folders).values({ id: folderId, projectId, name: 'Outputs', createdAt: now });
  await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Review output', status: 'todo', createdAt: now });
  const artifactIds: string[] = [];
  for (let index = 0; index < contents.length; index++) {
    const id = `artifact-${suffix}-${index}`;
    await db.insert(S.artifacts).values({ id, folderId, name: `output-${index}.txt`, content: contents[index], contentType: 'text/plain', createdAt: now });
    artifactIds.push(id);
  }
  return { db, orgId, userId, projectId, templateId: `template-${suffix}`, folderId, taskId, artifactIds, ctx: makeAuthContext(userId), handler: createArtifactsHandler(db) };
}

describe('explicit bounded evidence content (M54)', () => {
  it.each([1, 2, 3, 4, 5, 6])('returns a literal Unicode/NUL prefix of at most%i code points', async maxCharacters => {
    const literal = 'A😀\0éZ';
    const f = await fixture([literal]);
    const result: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters }, f.ctx);
    expect(result.content).toBe(Array.from(literal).slice(0, maxCharacters).join(''));
    expect(result.truncated).toBe(maxCharacters < Array.from(literal).length);
    expect(result.storedBytes).toBe(BigInt(Buffer.byteLength(literal, 'utf8')));
  });

  it.each([1, 2])('preserves a leading stored BOM at limit%i', async maxCharacters => {
    const literal = '\uFEFFa';
    const f = await fixture([literal]);
    // Install actual stored BOM bytes independently of Bun's text-binding bug.
    await f.db.update(S.artifacts).set({ content: sql`cast(${Buffer.from(literal)} as text)` }).where(eq(S.artifacts.id, f.artifactIds[0]!));
    const result: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters }, f.ctx);
    expect(result.content).toBe(Array.from(literal).slice(0, maxCharacters).join(''));
    expect(result.truncated).toBe(maxCharacters < 2);
    expect(result.storedBytes).toBe(4n);
  });

  it('bounds the SQL projection instead of loading the body and trimming in the adapter', async () => {
    const f = await fixture(['oversized body '.repeat(40_000)]);
    const guarded = new Proxy(f.db, { get(db, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = db.select(fields);
        return { from: (table: unknown) => {
          if (table === S.artifacts && (!fields || fields.content === S.artifacts.content)) throw new Error('full artifact body selected');
          return traceRows(query.from(table), rows => {
            if (table === S.artifacts && fields && 'prefix' in fields) {
              for (const row of rows) {
                const bytes = typeof row.prefix === 'string' ? Buffer.byteLength(row.prefix) : row.prefix.byteLength;
                expect(bytes).toBeLessThanOrEqual(4 * (8 + 1));
              }
            }
          });
        } };
      };
      return Reflect.get(db, key);
    } });
    const response: any = await createArtifactsHandler(guarded).getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters: 8 }, f.ctx);
    expect(response.content).toBe('oversize');
    expect(response.truncated).toBe(true);
  });

  it.each([0, -1, 1.5, 16001])('refuses invalid server limit%i independently of MCP', async maxCharacters => {
    const f = await fixture();
    await expect(f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters }, f.ctx)).rejects.toThrow();
  });

  it('keeps omitted-limit full reads and literal encoded representations compatible', async () => {
    const encoded = Buffer.from('encoded document 😀').toString('base64');
    const f = await fixture([encoded]);
    const legacy: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]! }, f.ctx);
    expect(legacy.content).toBe(encoded);
    expect(legacy.sizeBytes).toBe(BigInt(encoded.length));
    const bounded: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters: 4 }, f.ctx);
    expect(bounded.content).toBe(encoded.slice(0, 4));
    expect(bounded.truncated).toBe(true);
  });

  it('retains current organization authorization on bounded reads', async () => {
    const f = await fixture();
    await expect(f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters: 2 }, makeAuthContext('foreign-reader')))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
  });
});

describe('paged metadata and recorded link provenance (M54)', () => {
  it('pages links with metadata beyond20 and records current user/time without caller attribution', async () => {
    const f = await fixture(Array.from({ length: 25 }, (_, i) => `output ${i} 😀`));
    const started = Date.now() - 1000;
    for (const artifactId of f.artifactIds) {
      await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId, linkedAt: '1900-01-01', linkedBy: { kind: 'agent', id: 'forged' } }, f.ctx);
    }
    const first: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(first.links).toHaveLength(20);
    expect(first.page.totalCount).toBe(25);
    expect(first.page.nextCursor).toBeTruthy();
    expect(first.evidence).toHaveLength(20);
    const second: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20, cursor: first.page.nextCursor } }, f.ctx);
    expect(second.links).toHaveLength(5);
    expect(second.page.nextCursor || '').toBe('');
    expect(second.evidence).toHaveLength(5);
    expect(new Set([...first.links, ...second.links].map((link: any) => link.id)).size).toBe(25);
    for (const item of [...first.evidence, ...second.evidence]) {
      expect(item.availability).toBe('available');
      expect(item.contentType).toBe('text/plain');
      const index = f.artifactIds.indexOf(item.link.artifactId);
      expect(item.storedBytes).toBe(BigInt(Buffer.byteLength(`output ${index} 😀`)));
      expect(item.link.linkedBy).toMatchObject({ kind: 'user', id: f.userId });
      expect(Date.parse(item.link.linkedAt)).toBeGreaterThanOrEqual(started);
      expect(item).not.toHaveProperty('content');
    }
  });

  it('preserves original provenance on a repeated pair and leaves legacy provenance unknown', async () => {
    const f = await fixture();
    const a: any = await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, f.ctx);
    const b: any = await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, f.ctx);
    expect(a.link.linkedBy).toMatchObject({ kind: 'user', id: f.userId });
    expect(b.link).toEqual(a.link);
    await f.db.delete(S.taskArtifactLinks).where(eq(S.taskArtifactLinks.id, a.link.id));
    await f.db.insert(S.taskArtifactLinks).values({ id: `legacy-${f.taskId}`, taskId: f.taskId, artifactId: f.artifactIds[0]! });
    const page: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(page.links[0].linkedAt).toBeUndefined();
    expect(page.links[0].linkedBy).toBeUndefined();
  });

  it('marks readable archived sources distinctly and hides metadata from archived projects', async () => {
    const f = await fixture();
    await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, f.ctx);
    await f.db.update(S.artifacts).set({ deletedAt: new Date() }).where(eq(S.artifacts.id, f.artifactIds[0]!));
    const archived: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(archived.evidence[0].availability).toBe('archived');
    expect(archived.evidence[0].contentType).toBe('text/plain');
    // A cross-project source can become unavailable without archiving the task.
    const sourceProject = `${f.projectId}-source`;
    await f.db.insert(S.projects).values({ id: sourceProject, orgId: f.orgId, ownerId: f.userId, templateId: f.templateId, name: 'Source', key: 'SRC', createdAt: new Date() });
    await f.db.update(S.folders).set({ projectId: sourceProject }).where(eq(S.folders.id, f.folderId));
    await f.db.update(S.projects).set({ deletedAt: new Date() }).where(eq(S.projects.id, sourceProject));
    const removed: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(removed.evidence[0].availability).toBe('unavailable');
    expect(removed.evidence[0].link.artifactName).toBe('Artifact unavailable');
    expect(removed.links[0].artifactName).toBe('Artifact unavailable');
    expect(removed.evidence[0].storedBytes).toBeUndefined();
    expect(removed.evidence[0].contentType).toBeUndefined();
  });
});


describe('evidence permission and cursor lifetime', () => {
  it('records an agent linker snapshot, preserves it after rename/deletion and refuses missing scope', async () => {
    const f = await fixture();
    const roleId = `role-${f.taskId}`, agentId = `agent-${f.taskId}`;
    await f.db.insert(S.agentRoles).values({ id: roleId, orgId: f.orgId, name: 'Writer', systemPrompt: '', capabilities: '[]' });
    await f.db.insert(S.agents).values({ id: agentId, orgId: f.orgId, agentRoleId: roleId, name: 'Original worker' });
    const ctx = makeAuthContext(null);
    const principal = { kind: 'agent' as const, agentId, orgId: f.orgId, tokenId: 'fixture-token', scopes: ['artifacts:write', 'artifacts:read'] };
    ctx.values.set(currentPrincipalKey, principal);
    const linked: any = await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, ctx);
    expect(linked.link.linkedBy).toEqual({ kind: 'agent', id: agentId, name: 'Original worker' });
    await f.db.update(S.agents).set({ name: 'Renamed worker' }).where(eq(S.agents.id, agentId));
    const repeated: any = await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, ctx);
    expect(repeated.link).toEqual(linked.link);
    await f.db.delete(S.agents).where(eq(S.agents.id, agentId));
    const read: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(read.evidence[0].link.linkedBy).toEqual(linked.link.linkedBy);
    ctx.values.set(currentPrincipalKey, { ...principal, scopes: [] });
    await expect(f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters: 1 }, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId: f.artifactIds[0]! }, ctx)).rejects.toMatchObject({ code: Code.PermissionDenied });
  });

  it('restarts wrong-owner/axis cursors with current counts and keeps omitted pages compatible', async () => {
    const f = await fixture(['one', 'two', 'three']);
    for (const artifactId of f.artifactIds) await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId }, f.ctx);
    const first: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 1 } }, f.ctx);
    const foreignPosition = JSON.parse(Buffer.from(first.page.nextCursor, 'base64').toString());
    const foreignCursor = Buffer.from(JSON.stringify({ ...foreignPosition, id: 'zzzz', value: 'zzzz' })).toString('base64');
    const otherTask = `${f.taskId}-other`;
    await f.db.insert(S.tasks).values({ id: otherTask, projectId: f.projectId, title: 'Other task', status: 'todo', createdAt: new Date() });
    await f.handler.linkTaskArtifact({ taskId: otherTask, artifactId: f.artifactIds[0]! }, f.ctx);
    const other: any = await f.handler.listTaskArtifactLinks({ taskId: otherTask, page: { limit: 1, cursor: foreignCursor } }, f.ctx);
    expect(other.links).toHaveLength(1);
    expect(other.page.totalCount).toBe(1);
    expect(other.links[0].taskId).toBe(otherTask);
    const axis: any = await f.handler.listTaskArtifactLinks({ artifactId: f.artifactIds[0]!, page: { limit: 20, cursor: foreignCursor } }, f.ctx);
    expect(axis.links).toHaveLength(2);
    expect(axis.page.totalCount).toBe(2);
    const malformed: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 1, cursor: 'not-a-cursor' } }, f.ctx);
    expect(malformed.links[0].id).toBe(first.links[0].id);
    expect(malformed.page.totalCount).toBe(3);
    const legacy: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId }, f.ctx);
    expect(legacy.links).toHaveLength(3);
    expect(legacy.page).toBeUndefined();
    expect(legacy.evidence).toBeUndefined();
    await expect(f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { sort: '-id' } }, f.ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
    await expect(f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { filter: 'secret' } }, f.ctx)).rejects.toMatchObject({ code: Code.InvalidArgument });
  });

  it('does not load an existing artifact body just to refuse a duplicate create name', async () => {
    const f = await fixture(['large stored representation '.repeat(25_000)]);
    const guarded = new Proxy(f.db, { get(db, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = db.select(fields);
        return { from: (table: unknown) => {
          if (table === S.artifacts && (!fields || fields.content === S.artifacts.content)) throw new Error('duplicate name selected content');
          return query.from(table);
        } };
      };
      return Reflect.get(db, key);
    } });
    await expect(createArtifactsHandler(guarded).createArtifact({ folderId: f.folderId, name: 'output-0.txt', content: '' }, f.ctx))
      .rejects.toMatchObject({ code: Code.AlreadyExists });
  });
});


describe('evidence SQL result bounds', () => {
  it('caps link results before metadata lookups and never transfers bodies under an alias', async () => {
    const marker = 'body-must-stay-in-storage-';
    const f = await fixture(Array.from({ length: 25 }, () => marker.repeat(20_000)));
    for (const artifactId of f.artifactIds) await f.handler.linkTaskArtifact({ taskId: f.taskId, artifactId }, f.ctx);
    let sourceRows = 0, artifactRows = 0;
    const guarded = new Proxy(f.db, { get(db, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = db.select(fields);
        return { from: (table: unknown) => traceRows(query.from(table), rows => {
          if (table === S.taskArtifactLinks && !fields) {
            sourceRows += rows.length;
            expect(rows.length).toBeLessThanOrEqual(21);
          }
          if (table === S.artifacts) {
            artifactRows += rows.length;
            expect(rows.length).toBeLessThanOrEqual(20);
            for (const row of rows) {
              expect(Object.values(row).some(value => typeof value === 'string' && value.includes(marker))).toBe(false);
            }
          }
        }) };
      };
      return Reflect.get(db, key);
    } });
    const result: any = await createArtifactsHandler(guarded).listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(result.evidence).toHaveLength(20);
    expect(sourceRows).toBe(21);
    expect(artifactRows).toBe(20);
  });

  it('returns honest empty evidence and bounded exact/overflow maximum content', async () => {
    const f = await fixture(['', '😀'.repeat(16001)]);
    const empty: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]!, maxCharacters: 1 }, f.ctx);
    expect(empty.content).toBe('');
    expect(empty.truncated).toBe(false);
    expect(empty.storedBytes).toBe(0n);
    const large: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[1]!, maxCharacters: 16000 }, f.ctx);
    expect(large.content).toBe('😀'.repeat(16000));
    expect(large.truncated).toBe(true);
    expect(large.storedBytes).toBe(64004n);
    const page: any = await f.handler.listTaskArtifactLinks({ taskId: f.taskId, page: { limit: 20 } }, f.ctx);
    expect(page).toEqual({ links: [], evidence: [], page: { nextCursor: '', totalCount: 0 } });
  });
});


describe('literal SQLite artifact writes', () => {
  it('preserves leading BOM through create, update and independent stored reads', async () => {
    const f = await fixture([]), literal = '\uFEFFa';
    const created: any = await f.handler.createArtifact({ folderId: f.folderId, name: 'literal.md', content: literal }, f.ctx);
    const read: any = await f.handler.getArtifactContent({ artifactId: created.artifact.id }, f.ctx);
    expect(read.content).toBe(literal);
    await f.handler.updateArtifactContent({ artifactId: created.artifact.id, content: '\uFEFFupdated' }, f.ctx);
    const updated: any = await f.handler.getArtifactContent({ artifactId: created.artifact.id, maxCharacters: 8 }, f.ctx);
    expect(updated.content).toBe('\uFEFFupdated');
    expect(updated.storedBytes).toBe(10n);
    expect(updated.truncated).toBe(false);
  });
});


it('preserves a stored leading BOM when replacing existing artifact content', async () => {
  const f = await fixture(['original']);
  await f.handler.updateArtifactContent({ artifactId: f.artifactIds[0]!, content: '\uFEFFupdated' }, f.ctx);
  const read: any = await f.handler.getArtifactContent({ artifactId: f.artifactIds[0]! }, f.ctx);
  expect(read.content).toBe('\uFEFFupdated');
});
