import pino from 'pino';

/** Drizzle/driver exceptions embed SQL parameters in their message, stack and
 * cause. Preserve the original error for callers while exposing only a fixed
 * description and driver code to logs/telemetry. Never copy SQL or params. */
export function databaseErrorDetails(error: unknown): { type: string; message: string; code?: string } | null {
  let current: any = error;
  let database = false;
  let code: string | undefined;
  for (let depth = 0; current && depth < 8; depth++, current = current.cause) {
    if (typeof current.query === 'string' || Array.isArray(current.params) || typeof current.sql === 'string') database = true;
    if (typeof current.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(current.code)) code = current.code;
  }
  return database ? { type: 'DatabaseError', message: 'database operation failed', ...(code ? { code } : {}) } : null;
}

export function safeErrorSerializer(error: unknown) {
  return databaseErrorDetails(error) ?? (error instanceof Error ? pino.stdSerializers.err(error) : error);
}
