import { describe, expect, it } from 'bun:test';
import { Code } from '@connectrpc/connect';
import * as S from '../../db/schema.sqlite';
import { setupIntegrationTest, seedOrgWithAdmin, seedProject, makeAuthContext } from '../../test/setup';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { createArtifactsHandler } from './artifacts.handler';

async function fixture() {
  const { db } = await setupIntegrationTest();
  const key = crypto.randomUUID(), orgId = `org-${key}`, userId = `user-${key}`, projectId = `project-${key}`;
  await seedOrgWithAdmin(db, { orgId, userId, name: 'Navigation' });
  await seedProject(db, { orgId, userId, templateId: `template-${key}`, projectId, name: 'Owning project' });
  const taskId = `task-${key}`, folderId = `folder-${key}`, artifactId = `artifact-${key}`;
  await db.insert(S.tasks).values({ id: taskId, projectId, title: 'Scoped task', displayId: 'NAV-1', status: 'todo', createdAt: new Date() });
  await db.insert(S.folders).values({ id: folderId, projectId, name: 'Documents', createdAt: new Date() });
  await db.insert(S.artifacts).values({ id: artifactId, folderId, name: 'Scoped artifact', description: 'Metadata only',
    content: 'private body never selected by metadata reads '.repeat(25_000), contentType: 'text/plain', createdAt: new Date() });
  return { db, orgId, userId, projectId, taskId, folderId, artifactId, ctx: makeAuthContext(userId) };
}

describe('authorized canonical navigation metadata (M53)', () => {
  it('returns the task owner organization without trusting caller scope', async () => {
    const f = await fixture();
    const response = await createTaskManagementHandler(f.db).getTask({ taskId: f.taskId,
      orgId: 'caller-supplied-org', projectId: 'caller-supplied-project' }, f.ctx);
    expect(response).toMatchObject({ orgId: f.orgId, task: { id: f.taskId, projectId: f.projectId } });
  });

  it('returns the artifact actual organization and project without trusting caller scope', async () => {
    const f = await fixture();
    const response = await createArtifactsHandler(f.db).getArtifact({ artifactId: f.artifactId,
      orgId: 'caller-supplied-org', projectId: 'caller-supplied-project' }, f.ctx);
    expect(response).toMatchObject({ orgId: f.orgId, projectId: f.projectId, artifact: { id: f.artifactId, folderId: f.folderId } });
  });

  it('resolves artifact metadata without selecting its body, including during authorization', async () => {
    const f = await fixture();
    const bounded = new Proxy(f.db, { get(db, key) {
      if (key === 'select') return (fields?: Record<string, unknown>) => {
        const query = db.select(fields);
        return { from: (table: unknown) => {
          if (table === S.artifacts && (!fields || Object.hasOwn(fields, 'content'))) {
            throw new Error('metadata read selected the artifact body');
          }
          return query.from(table);
        } };
      };
      return Reflect.get(db, key);
    } });
    const response = await createArtifactsHandler(bounded).getArtifact({ artifactId: f.artifactId }, f.ctx);
    expect(response).toMatchObject({ orgId: f.orgId, projectId: f.projectId, artifact: { name: 'Scoped artifact' } });
    expect(response.artifact).not.toHaveProperty('content');
  });

  it('denies foreign readers instead of returning resource ownership', async () => {
    const f = await fixture(), foreign = makeAuthContext('foreign-user');
    await expect(createTaskManagementHandler(f.db).getTask({ taskId: f.taskId }, foreign)).rejects.toMatchObject({ code: Code.PermissionDenied });
    await expect(createArtifactsHandler(f.db).getArtifact({ artifactId: f.artifactId }, foreign)).rejects.toMatchObject({ code: Code.PermissionDenied });
  });
});
