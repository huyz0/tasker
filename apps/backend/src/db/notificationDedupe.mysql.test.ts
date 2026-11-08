import { it, expect } from 'bun:test';
import { eq } from 'drizzle-orm';
import { setupDatabase } from './db';
import * as S from './schema.mysql';

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
mysqlTest('migrates utf8mb4 MySQL and deduplicates full notification keys without prefix collisions', async () => {
  const db: any = await setupDatabase('mysql');
  const id = crypto.randomUUID();
  const userId = `user-${id}`, orgId = `org-${id}`;
  try {
    await db.insert(S.users).values({ id: userId });
    await db.insert(S.organizations).values({ id: orgId, name: 'dedupe', slug: orgId });
    const notification = (suffix: string, dedupeKey: string) => ({
      id: `${id}-${suffix}`, userId, orgId, type: 'task.stalled', title: 'test', body: 'test', dedupeKey, createdAt: new Date(),
    });
    const prefix = 'x'.repeat(511);
    await db.insert(S.notifications).values(notification('a', prefix + 'a'));
    await db.insert(S.notifications).values(notification('b', prefix + 'b'));
    await expect(Promise.resolve(db.insert(S.notifications).values(notification('duplicate', prefix + 'a')))).rejects.toThrow();
    await db.insert(S.notifications).values(notification('unicode', '😀'.repeat(400)));
    expect(await db.select().from(S.notifications).where(eq(S.notifications.orgId, orgId))).toHaveLength(3);
  } finally {
    await db.delete(S.notifications).where(eq(S.notifications.orgId, orgId));
    await db.delete(S.organizations).where(eq(S.organizations.id, orgId));
    await db.delete(S.users).where(eq(S.users.id, userId));
    await db.$client.end();
  }
}, 30_000);
