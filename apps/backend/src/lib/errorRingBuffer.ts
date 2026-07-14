import { getRequestContext } from './requestContext';

// Keeps the last N reported errors in memory, so "what broke recently" is
// answerable without log/file access at all - useful when debugging a
// process I can't shell into or don't have LOG_FILE output from.
const MAX_ENTRIES = 100;

export interface RingBufferEntry {
  timestamp: string;
  message: string;
  severity: 'error' | 'fatal';
  errName?: string;
  errMessage?: string;
  requestId?: string;
  userId?: string | null;
  context?: Record<string, unknown>;
}

const entries: RingBufferEntry[] = [];

export function recordErrorEvent(message: string, severity: 'error' | 'fatal', err: unknown, context?: Record<string, unknown>): void {
  const requestCtx = getRequestContext();
  const errObj = err instanceof Error ? err : undefined;
  entries.push({
    timestamp: new Date().toISOString(),
    message,
    severity,
    ...(errObj ? { errName: errObj.name, errMessage: errObj.message } : {}),
    ...(requestCtx?.requestId ? { requestId: requestCtx.requestId } : {}),
    ...(requestCtx ? { userId: requestCtx.userId ?? null } : {}),
    ...(context ? { context } : {}),
  });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

export function getRecentErrors(): RingBufferEntry[] {
  // Most recent first, so a debugger doesn't have to scroll past old entries.
  return [...entries].reverse();
}

// Test-only: reset accumulated state between test runs.
export function resetErrorRingBuffer(): void {
  entries.length = 0;
}
