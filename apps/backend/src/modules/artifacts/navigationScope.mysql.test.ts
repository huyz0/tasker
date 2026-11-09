import { expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import mysql from 'mysql2/promise';
import { setupDatabase } from '../../db/db';
import * as S from '../../db/schema.mysql';
import { makeAuthContext } from '../../test/setup';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { createArtifactsHandler } from './artifacts.handler';

const enabled = process.env.TASKER_MYSQL_INTEGRATION === '1';
(enabled ? it : it.skip)('MySQL canonical metadata is authorized, bounded and derived from actual ownership', async () => {
  const previousStandalone = process.env.STANDALONE, previousName = process.env.DB_NAME;
  const key = crypto.randomUUID().replaceAll('-', ''), databaseName = `tasker_navigation_${key}`;
  const admin = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD });
  let db: any;
  try {
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`);
    process.env.STANDALONE = 'false'; process.env.DB_NAME = databaseName;
    db = await setupDatabase('mysql');
    const orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
    const taskId = `task-${key}`, folderId = `folder-${key}`, artifactId = `artifact-${key}`, now = new Date();
    await db.insert(S.users).values({ id: userId, createdAt: now });
    await db.insert(S.organizations).values({ id: orgId, name: 'Navigation', slug: orgId, createdAt: now });
    await db.insert(S.organizationMembers).values({ orgId, userId, role: 'admin', joinedAt: now });
    await db.insert(S.projectTemplates).values({ id: `template-${key}`, orgId, name: 'Navigation', createdAt: now });
    await db.insert(S.projects).values({ id: projectId, orgId, templateId: `template-${key}`, ownerId: userId,
      name: 'Owning project', key: 'NAV', createdAt: now });
    await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Scoped task', displayId: 'NAV-1', status: 'todo', createdAt: now });
    await db.insert(S.folders).values({ id: folderId, projectId, name: 'Documents', createdAt: now });
    await db.insert(S.artifacts).values({ id: artifactId, folderId, name: 'Scoped artifact', description: 'Metadata',
      content: 'private body '.repeat(100_000), contentType: 'text/plain', createdAt: now });
    const ctx = makeAuthContext(userId), foreign = makeAuthContext('foreign-user');
    const bounded = new Proxy(db, { get(target, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = target.select(fields);
        return { from: (table: unknown) => {
          if (table === S.artifacts && (!fields || Object.hasOwn(fields, 'content'))) {
            throw new Error('metadata read selected the artifact body');
          }
          return query.from(table);
        } };
      };
      return Reflect.get(target, key);
    } });
    const tasks = createTaskManagementHandler(bounded), artifacts = createArtifactsHandler(bounded);
    expect(await tasks.getTask({ taskId, orgId: 'spoofed' }, ctx)).toMatchObject({ orgId, task: { projectId } });
    const response = await artifacts.getArtifact({ artifactId, orgId: 'spoofed', projectId: 'spoofed' }, ctx);
    expect(response).toMatchObject({ orgId, projectId, artifact: { id: artifactId, folderId } });
    expect(response.artifact).not.toHaveProperty('content');
    await expect(tasks.getTask({ taskId }, foreign)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(artifacts.getArtifact({ artifactId }, foreign)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await db.update(S.artifacts).set({ deletedAt: now }).where((await import('drizzle-orm')).eq(S.artifacts.id, artifactId));
    expect(await artifacts.getArtifact({ artifactId }, ctx)).toMatchObject({ orgId, projectId });
    await db.update(S.projects).set({ deletedAt: now }).where((await import('drizzle-orm')).eq(S.projects.id, projectId));
    await expect(artifacts.getArtifact({ artifactId }, ctx)).rejects.toMatchObject({ code: Code.NotFound });
  } finally {
    if (db) await db.$client.end();
    try { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); } finally { await admin.end(); }
    if (previousStandalone === undefined) delete process.env.STANDALONE; else process.env.STANDALONE = previousStandalone;
    if (previousName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = previousName;
  }
}, 90_000);
