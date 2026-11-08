import { describe, it, expect } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupDatabase } from './db';
import { withUnitOfWork, afterCommit } from './access';

const rows = (db: any) => db.all(sql`select id from access_test order by id`);
async function fixture() {
  const db: any = await setupDatabase('sqlite', ':memory:');
  await db.run(sql`create table access_test(id integer primary key)`);
  return db;
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(r => { release = r; });
  return { promise, release };
}

describe('asynchronous database unit of work', () => {
  it('rolls back every awaited write on failure', async () => {
    const db = await fixture();
    await expect(withUnitOfWork(db, async () => {
      await db.run(sql`insert into access_test values(1)`);
      await db.run(sql`insert into access_test values(2)`);
      throw new Error('interrupted');
    })).rejects.toThrow('interrupted');
    expect(await rows(db)).toEqual([]);
  });

  it('makes a concurrent reader wait rather than seeing provisional writes', async () => {
    const db = await fixture(), written = latch(), resume = latch();
    const writer = withUnitOfWork(db, async () => {
      await db.run(sql`insert into access_test values(1)`);
      written.release();
      await resume.promise;
      throw new Error('rollback');
    });
    // Attach rejection before releasing the writer, so it is always observed.
    const failed = writer.then(() => null, error => error as Error);
    await written.promise;
    let observed = false;
    const reader = Promise.resolve(rows(db)).then(value => { observed = true; return value; });
    await new Promise(r => setTimeout(r, 5));
    try { expect(observed).toBe(false); } finally { resume.release(); }
    expect((await failed)?.message).toBe('rollback');
    expect(await reader).toEqual([]);
  });

  it('shares nested work and only publishes after the outer commit', async () => {
    const db = await fixture();
    const delivered: number[] = [];
    await withUnitOfWork(db, async () => {
      await withUnitOfWork(db, async () => {
        await db.run(sql`insert into access_test values(1)`);
        expect(afterCommit(() => { delivered.push(1); })).toBe(true);
      });
      expect(delivered).toEqual([]);
    });
    expect(delivered).toEqual([1]);
    expect(afterCommit(() => { delivered.push(2); })).toBe(false);
  });

  it('discards callbacks and nested synchronous writes on rollback', async () => {
    const db = await fixture();
    const delivered: number[] = [];
    await expect(withUnitOfWork(db, async () => {
      const result = db.transaction((tx: any) => {
        tx.run(sql`insert into access_test values(1)`);
        return 42;
      });
      expect(result).toBe(42);
      afterCommit(() => { delivered.push(1); });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect(await rows(db)).toEqual([]);
    expect(delivered).toEqual([]);
  });
});

describe('managed fluent access', () => {
  it('executes fluent writes and reads in their transaction, without exposing provisional synchronous reads', async () => {
    const { users } = await import('./schema.sqlite');
    const db = await fixture(), written = latch(), resume = latch();
    const writer = withUnitOfWork(db, async () => {
      await db.insert(users).values({ id: 'provisional', createdAt: new Date() });
      expect(await db.select().from(users)).toHaveLength(1);
      written.release();
      await resume.promise;
    });
    await written.promise;
    expect(() => db.select().from(users).all()).toThrow('synchronous query');
    expect(() => db.transaction(() => 1)).toThrow('synchronous transaction');
    const reader = Promise.resolve(db.select().from(users));
    resume.release();
    await writer;
    expect(await reader).toHaveLength(1);
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  it('refuses an async callback to the synchronous SQLite API before any write runs', async () => {
    const db = await fixture();
    expect(() => db.transaction(async (tx: any) => {
      tx.run(sql`insert into access_test values(1)`);
      await Promise.resolve();
      tx.run(sql`insert into access_test values(2)`);
    })).toThrow('withUnitOfWork');
    await Promise.resolve();
    expect(await rows(db)).toEqual([]);
  });

  it('keeps a committed result even when an external after-commit action fails', async () => {
    const db = await fixture();
    expect(await withUnitOfWork(db, async () => {
      await db.run(sql`insert into access_test values(1)`);
      afterCommit(() => { throw new Error('external action unavailable'); });
      return 42;
    })).toBe(42);
    expect(await rows(db)).toEqual([{ id: 1 }]);
  });
});

const mysqlTest = process.env.TASKER_MYSQL_INTEGRATION === '1' ? it : it.skip;
mysqlTest('uses one real MySQL transaction connection and rolls back nested operations', async () => {
  const db: any = await setupDatabase('mysql');
  const id = `access-${crypto.randomUUID()}`;
  const { users } = await import('./schema.mysql');
  try {
    await expect(withUnitOfWork(db, async () => {
      await db.insert(users).values({ id });
      await withUnitOfWork(db, async () => {
        const { eq } = await import('drizzle-orm');
        expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(1);
      });
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    const { eq } = await import('drizzle-orm');
    expect(await db.select().from(users).where(eq(users.id, id))).toEqual([]);
    await withUnitOfWork(db, async () => { await db.insert(users).values({ id }); });
    expect(await db.select().from(users).where(eq(users.id, id))).toHaveLength(1);
    await db.delete(users).where(eq(users.id, id));
  } finally {
    await db.$client.end();
  }
}, 30_000);
