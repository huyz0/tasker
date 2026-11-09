import { logger } from './logger';

/** One bounded periodic operation per instance; stopping disables new ticks
 * and awaits the application promise rather than just clearing a timer. */
export function createBackgroundWorker(name: string, intervalMs: number, operation: () => Promise<unknown>, onError?: (error: unknown) => void) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | null = null;
  let stopped = false;
  function tick() {
    if (stopped || active) return;
    active = Promise.resolve().then(operation).then(() => {}, error => {
      try {
        if (onError) onError(error); else logger.error({ err: error, worker: name }, 'background_worker.failed');
      } catch (reportError) { logger.error({ err: reportError, worker: name }, 'background_worker.error_reporting_failed'); }
    }).finally(() => { active = null; });
  }
  return {
    start() { if (!stopped && !timer) timer = setInterval(tick, intervalMs); },
    async stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      if (active) await active;
    },
  };
}
