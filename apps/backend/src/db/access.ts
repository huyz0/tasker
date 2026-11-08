import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger';

type CommitCallback = () => void | Promise<void>;
interface DatabaseState {
  raw: any;
  sqlite: boolean;
  busy: boolean;
  transaction: boolean;
  tail: Promise<void>;
}
interface AccessScope {
  state: DatabaseState;
  db: any;
  transaction: boolean;
  committed: CommitCallback[];
}
const current = new AsyncLocalStorage<AccessScope>();
const stateKey = Symbol('tasker.database.access');

function owned(state: DatabaseState): AccessScope | undefined {
  const scope = current.getStore();
  return scope?.state === state ? scope : undefined;
}

async function access<T>(state: DatabaseState, fn: () => T | PromiseLike<T>): Promise<T> {
  if (!state.sqlite || owned(state)) return await fn();
  const before = state.tail;
  let release!: () => void;
  state.tail = new Promise<void>(resolve => { release = resolve; });
  await before;
  state.busy = true;
  try {
    return await current.run({ state, db: state.raw, transaction: false, committed: [] }, async () => await fn());
  } finally {
    state.busy = false;
    release();
  }
}

function isBuilder(value: any): boolean {
  return value && typeof value === 'object' && !(value instanceof Promise) && !Array.isArray(value)
    && ['then', 'from', 'values', 'set', 'where', 'execute', 'all', 'as'].some(key => typeof value[key] === 'function');
}

/** Fluent query construction stays synchronous; awaited execution owns the gate. */
function queryHandle(state: DatabaseState, query: any): any {
  if (!isBuilder(query)) return query;
  return new Proxy(query, {
    get(target, key) {
      if (key === 'then') return (resolve: any, reject: any) => access(state, () => target).then(resolve, reject);
      if (key === 'catch') return (reject: any) => access(state, () => target).catch(reject);
      if (key === 'finally') return (done: any) => access(state, () => target).finally(done);
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      return (...args: any[]) => {
        if (key === 'execute') return access(state, () => value.apply(target, args));
        if (key === 'all' || key === 'get' || key === 'run') {
          if (state.sqlite && state.transaction && !owned(state)) {
            throw new Error('synchronous query during another request\'s transaction; await the query instead');
          }
        }
        return queryHandle(state, value.apply(target, args));
      };
    },
  });
}

/**
 * One managed handle per connection/pool. Transaction context selects the
 * MySQL connection; the SQLite gate prevents reads of provisional writes even
 * when a multi-statement operation awaits between statements (ADR-0038).
 */
export function manageDatabase<T extends object>(raw: T, sqlite: boolean): T {
  const state: DatabaseState = { raw, sqlite, busy: false, transaction: false, tail: Promise.resolve() };
  return new Proxy(raw, {
    get(_target, key) {
      if (key === stateKey) return state;
      const target = owned(state)?.db ?? raw;
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (key === 'transaction' && sqlite) return (fn: (tx: any) => any, ...args: any[]) => {
        if (state.transaction && !owned(state)) throw new Error('synchronous transaction during another request\'s transaction');
        if (fn.constructor.name === 'AsyncFunction') throw new Error('use withUnitOfWork for asynchronous SQLite transactions');
        return value.call(target, (tx: any) => {
          const result = fn(tx);
          if (result && typeof result.then === 'function') throw new Error('use withUnitOfWork for asynchronous SQLite transactions');
          return result;
        }, ...args);
      };
      // Direct SQL helpers execute immediately rather than constructing a
      // query, so acquire the connection before invoking them.
      if (sqlite && ['run', 'all', 'get', 'values'].includes(String(key))) {
        return (...args: any[]) => owned(state)
          ? value.apply(target, args)
          : access(state, () => value.apply(target, args));
      }
      return (...args: any[]) => queryHandle(state, value.apply(target, args));
    },
  });
}

/** Shares the parent's transaction; only the outermost owner commits. */
export async function withUnitOfWork<T>(db: any, fn: () => Promise<T>): Promise<T> {
  const state: DatabaseState | undefined = db[stateKey];
  if (!state) throw new Error('unit of work requires a managed database handle');
  const parent = owned(state);
  if (parent?.transaction) return fn();
  const callbacks: CommitCallback[] = [];
  const result = await access(state, async () => {
    if (!state.sqlite) {
      return state.raw.transaction((tx: any) => current.run({ state, db: tx, transaction: true, committed: callbacks }, fn));
    }
    state.raw.run(sql.raw('BEGIN IMMEDIATE'));
    state.transaction = true;
    try {
      const value = await current.run({ state, db: state.raw, transaction: true, committed: callbacks }, fn);
      state.raw.run(sql.raw('COMMIT'));
      return value;
    } catch (error) {
      state.raw.run(sql.raw('ROLLBACK'));
      throw error;
    } finally {
      state.transaction = false;
    }
  });
  // No transaction context while publishing. A callback cannot accidentally
  // append to the just-committed buffer or execute SQL on a released MySQL tx.
  await current.exit(async () => {
    for (const callback of callbacks) {
      try { await callback(); }
      catch (err) { logger.error({ err }, 'database.after_commit_failed'); }
    }
  });
  return result;
}

/** False outside a transaction: the caller should perform its action now. */
export function afterCommit(callback: CommitCallback): boolean {
  const scope = current.getStore();
  if (!scope?.transaction) return false;
  scope.committed.push(callback);
  return true;
}
