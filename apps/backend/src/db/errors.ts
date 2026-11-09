import { Code, ConnectError } from '@connectrpc/connect';

/** A rolled-back lock/reservation conflict is retryable, never a second execution. */
export function transactionConflict(error: unknown, reserving = false): ConnectError | null {
  const codes = new Set<string>();
  let cause: any = error;
  for (let depth = 0; cause && depth < 8; depth++, cause = cause.cause) {
    if (typeof cause.code === 'string') codes.add(cause.code);
  }
  if (['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_LOCKED', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].some(code => codes.has(code))
    || (reserving && codes.has('ER_DUP_ENTRY'))) {
    return new ConnectError('another mutation is processing this work - retry the request, reusing its idempotency key if supplied', Code.Aborted, undefined, undefined, error);
  }
  return null;
}
