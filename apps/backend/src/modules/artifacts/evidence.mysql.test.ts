import { expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { Code } from '@connectrpc/connect';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { makeAuthContext } from '../../test/setup';
import { createArtifactsHandler } from './artifacts.handler';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { currentPrincipalKey } from '../auth/session';

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL evidence bounds/paging/provenance use real UTF-8 binary SQL and current authorization', async () => {
  const previous = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const databaseName = `tasker_evidence_${crypto.randomUUID().replaceAll('-', '')}`;
  let db: any, admin: Awaited<ReturnType<typeof mysql.createConnection>> | undefined, schemaCreated = false;
  try {
    admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
    schemaCreated = true;
    process.env.STANDALONE = 'false'; process.env.DB_NAME = databaseName;
    db = await setupDatabase('mysql');
    const suffix = crypto.randomUUID(), orgId = `org-${suffix}`, userId = `user-${suffix}`;
    const templateId = `template-${suffix}`, projectId = `project-${suffix}`, taskId = `task-${suffix}`, folderId = `folder-${suffix}`;
    const now = new Date(), ctx = makeAuthContext(userId), handler = createArtifactsHandler(db);
    await db.insert(S.users).values({ id: userId, email: `${suffix}@example.test`, name: 'SQL reviewer', createdAt: now });
    await db.insert(S.organizations).values({ id: orgId, slug: orgId, name: 'SQL evidence', createdAt: now });
    await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
    await db.insert(S.projectTemplates).values({ id: templateId, orgId, name: 'Template', createdAt: now });
    await db.insert(S.projects).values({ id: projectId, orgId, ownerId: userId, templateId, key: 'EVD', name: 'Evidence', createdAt: now });
    await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Review', status: 'todo', createdAt: now });
    await db.insert(S.folders).values({ id: folderId, projectId, name: 'Outputs', createdAt: now });
    const literal = 'A😀\0éZ';
    const created: any = await handler.createArtifact({ folderId, name: 'literal.txt', content: literal, contentType: 'text/plain' }, ctx);
    const artifactId = created.artifact.id;
    for (const limit of [1, 2, 3, 4, 5, 16000]) {
      const response: any = await handler.getArtifactContent({ artifactId, maxCharacters: limit }, ctx);
      expect(response.content).toBe(Array.from(literal).slice(0, limit).join(''));
      expect(response.storedBytes).toBe(BigInt(Buffer.byteLength(literal)));
      expect(response.sizeBytes).toBe(BigInt(Buffer.byteLength(literal)));
      expect(response.truncated).toBe(limit < 5);
    }
    const bomCreated: any = await handler.createArtifact({ folderId, name: 'bom.txt', content: '\uFEFFa', contentType: 'text/plain' }, ctx);
    const bomId = bomCreated.artifact.id;
    for (const maxCharacters of [1, 2]) {
      const bom: any = await handler.getArtifactContent({ artifactId: bomId, maxCharacters }, ctx);
      expect(bom.content).toBe(Array.from('\uFEFFa').slice(0, maxCharacters).join(''));
      expect(bom.truncated).toBe(maxCharacters < 2);
      expect(bom.storedBytes).toBe(4n);
    }
    await handler.updateArtifactContent({ artifactId: bomId, content: '\uFEFFupdated' }, ctx);
    const updatedBOM: any = await handler.getArtifactContent({ artifactId: bomId, maxCharacters: 8 }, ctx);
    expect(updatedBOM.content).toBe('\uFEFFupdated');
    expect(updatedBOM.truncated).toBe(false);
    const emptyCreated: any = await handler.createArtifact({ folderId, name: 'empty.txt', content: '' }, ctx);
    const empty: any = await handler.getArtifactContent({ artifactId: emptyCreated.artifact.id, maxCharacters: 1 }, ctx);
    expect(empty.content).toBe('');
    expect(empty.truncated).toBe(false);
    expect(empty.storedBytes).toBe(0n);
    const legacy: any = await handler.getArtifactContent({ artifactId }, ctx);
    expect(legacy.content).toBe(literal);
    expect(legacy.sizeBytes).toBe(BigInt(literal.length));
    for (const maxCharacters of [0, -1, 1.5, 16001]) {
      await expect(handler.getArtifactContent({ artifactId, maxCharacters }, ctx)).rejects.toThrow();
    }
    const a: any = await handler.linkTaskArtifact({ taskId, artifactId, linkedBy: { id: 'forged' } }, ctx);
    const b: any = await handler.linkTaskArtifact({ taskId, artifactId }, ctx);
    expect(a.link.linkedBy).toEqual({ kind: 'user', id: userId, name: 'SQL reviewer' });
    expect(a.link.linkedAt).toBeTruthy();
    expect(b.link).toEqual(a.link);
    for (let i = 0; i < 24; i++) {
      const id = `${artifactId}-${i}`;
      await db.insert(S.artifacts).values({ id, folderId, name: `${i}.txt`, content: 'large body '.repeat(1000), contentType: 'text/plain', createdAt: now });
      await handler.linkTaskArtifact({ taskId, artifactId: id }, ctx);
    }
    const first: any = await handler.listTaskArtifactLinks({ taskId, page: { limit: 20 } }, ctx);
    const next: any = await handler.listTaskArtifactLinks({ taskId, page: { limit: 20, cursor: first.page.nextCursor } }, ctx);
    expect(first.canLink).toBe(true);
    expect(first.canUnlink).toBe(true);
    expect(first.links).toHaveLength(20);
    expect(first.evidence).toHaveLength(20);
    expect(next.links).toHaveLength(5);
    expect(next.evidence).toHaveLength(5);
    expect(first.page.totalCount).toBe(25);
    expect(new Set([...first.links, ...next.links].map((link: any) => link.id)).size).toBe(25);
    expect([...first.evidence, ...next.evidence].every((item: any) => item.availability === 'available' && !('content' in item))).toBe(true);
    const tasks = createTaskManagementHandler(db), reader = makeAuthContext(null);
    const principal = { kind: 'agent' as const, agentId: 'digest-reader', orgId, tokenId: 'fixture-token', scopes: ['tasks:read'] };
    reader.values.set(currentPrincipalKey, principal);
    const ordinary: any = await tasks.getTaskDigest({ taskId }, reader);
    expect(ordinary.digest).not.toHaveProperty('artifacts');
    const optedOut: any = await tasks.getTaskDigest({ taskId, includeArtifacts: false }, reader);
    expect(optedOut.digest).not.toHaveProperty('artifacts');
    await expect(tasks.getTaskDigest({ taskId, includeArtifacts: true }, reader)).rejects.toMatchObject({ code: Code.PermissionDenied });
    reader.values.set(currentPrincipalKey, { ...principal, scopes: ['tasks:read', 'artifacts:read'] });
    const readControls: any = await handler.listTaskArtifactLinks({ taskId, page: { limit: 20 } }, reader);
    expect(readControls.canLink).toBe(false);
    expect(readControls.canUnlink).toBe(false);
    reader.values.set(currentPrincipalKey, { ...principal, scopes: ['tasks:read', 'artifacts:read', 'artifacts:write'] });
    const writeControls: any = await handler.listTaskArtifactLinks({ taskId, page: { limit: 20 } }, reader);
    expect(writeControls.canLink).toBe(true);
    expect(writeControls.canUnlink).toBe(false);
    const enriched: any = await tasks.getTaskDigest({ taskId, includeArtifacts: true }, reader);
    expect(enriched.digest.artifacts).toHaveLength(20);
    expect(enriched.digest.truncated).toBe(true);
    expect(enriched.digest.artifacts.every((item: any) => item.availability === 'available' && !('content' in item))).toBe(true);
    const metadata = [...first.evidence, ...next.evidence].find((item: any) => item.link.artifactId === artifactId);
    expect(metadata.storedBytes).toBe(BigInt(Buffer.byteLength(literal)));
    await expect(handler.listTaskArtifactLinks({ taskId, page: { limit: 20 } }, makeAuthContext('foreign-user')))
      .rejects.toMatchObject({ code: Code.PermissionDenied });
    await db.update(S.folders).set({ deletedAt: now }).where(eq(S.folders.id, folderId));
    const archived: any = await handler.listTaskArtifactLinks({ taskId, page: { limit: 1 } }, ctx);
    expect(archived.evidence[0].availability).toBe('archived');
    const old: any = await handler.listTaskArtifactLinks({ taskId }, ctx);
    expect(old.links).toHaveLength(25);
    expect(old.page).toBeUndefined();
    expect(old).not.toHaveProperty('canLink');
    expect(old).not.toHaveProperty('canUnlink');
  } finally {
    if (db) await db.$client.end();
    if (admin) {
      try { if (schemaCreated) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); } finally { await admin.end(); }
    }
    if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
    if (previous === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previous;
  }
}, 60_000);
