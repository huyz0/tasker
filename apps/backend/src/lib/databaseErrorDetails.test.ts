import { expect, it } from 'bun:test';
import { databaseErrorDetails, safeErrorSerializer } from './databaseErrorDetails';
import { recordErrorEvent, getRecentErrors, resetErrorRingBuffer } from './errorRingBuffer';

it('keeps SQL event bodies and parameters out of structured logs and the error ring', () => {
  const content = 'private-artifact-body-fixture';
  const cause = Object.assign(new Error(`Duplicate entry ${content}`), { code: 'ER_DUP_ENTRY', sql: `INSERT payload '${content}'` });
  const error = Object.assign(new Error(`Failed query: INSERT event\nparams: ${content}`, { cause }), { query: 'INSERT event', params: [content] });
  const serialized = safeErrorSerializer(error);
  expect(serialized).toMatchObject({ type: 'DatabaseError', message: 'database operation failed', code: 'ER_DUP_ENTRY' });
  expect(JSON.stringify(serialized)).not.toContain(content);
  expect(serialized).not.toHaveProperty('params');
  expect(serialized).not.toHaveProperty('sql');
  expect(error.cause).toBe(cause);
  resetErrorRingBuffer();
  recordErrorEvent('capture failed', 'error', error);
  expect(getRecentErrors()[0]).toMatchObject({ errName: 'DatabaseError', errMessage: 'database operation failed' });
  expect(JSON.stringify(getRecentErrors())).not.toContain(content);
  resetErrorRingBuffer();
});

it('retains ordinary non-database error diagnostics', () => {
  const error = new Error('ordinary failure');
  expect(databaseErrorDetails(error)).toBeNull();
  expect(safeErrorSerializer(error)).toMatchObject({ message: 'ordinary failure' });
});
