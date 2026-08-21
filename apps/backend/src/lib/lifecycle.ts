/**
 * Readiness, liveness and draining (M11-T08).
 *
 * Three states a container platform needs told apart, which a single `/healthz`
 * cannot express:
 *
 * - **Live** — the process is not wedged. A failing liveness probe gets the
 *   container killed, so it must not depend on anything external: a database
 *   outage that fails liveness turns one outage into a restart loop across
 *   every replica.
 * - **Ready** — this instance should receive traffic. This *does* depend on
 *   dependencies, and on not shutting down.
 * - **Draining** — still finishing in-flight work, but no longer ready. The
 *   gap between "removed from the load balancer" and "process exits" is the
 *   whole reason a deploy can be free of dropped requests.
 *
 * Kept as a small state object rather than flags scattered through `index.ts`,
 * because the ordering — stop being ready, *then* wait, *then* close — is the
 * part that is easy to get wrong and impossible to test in place.
 */

export type LifecycleState = 'starting' | 'ready' | 'draining';

export interface ReadinessReport {
  ready: boolean;
  state: LifecycleState;
  inFlight: number;
  reason?: string;
}

export class Lifecycle {
  private state: LifecycleState = 'starting';
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  markReady(): void {
    if (this.state === 'starting') this.state = 'ready';
  }

  get inFlightCount(): number {
    return this.inFlight;
  }

  /**
   * Liveness. True from the moment the process is running until it exits.
   *
   * Deliberately not affected by draining: a pod being asked to stop is
   * healthy, and reporting it as dead invites the platform to `SIGKILL` it
   * mid-request instead of letting the drain finish.
   */
  isLive(): boolean {
    return true;
  }

  readiness(): ReadinessReport {
    if (this.state === 'draining') {
      return { ready: false, state: this.state, inFlight: this.inFlight, reason: 'shutting down' };
    }
    if (this.state === 'starting') {
      return { ready: false, state: this.state, inFlight: this.inFlight, reason: 'still starting' };
    }
    return { ready: true, state: this.state, inFlight: this.inFlight };
  }

  /** Wraps a request so the drain knows how many are still running. */
  async track<T>(fn: () => Promise<T>): Promise<T> {
    this.inFlight += 1;
    try {
      return await fn();
    } finally {
      this.inFlight -= 1;
      if (this.inFlight === 0) {
        const waiters = this.waiters;
        this.waiters = [];
        for (const resolve of waiters) resolve();
      }
    }
  }

  /**
   * Stops accepting new work and waits for what is running.
   *
   * Returns whether it drained cleanly or ran out of time. The timeout exists
   * because a single stuck request must not hold a deploy open forever, and a
   * platform that gave up waiting would `SIGKILL` anyway — better to exit
   * deliberately and say so.
   */
  async drain(timeoutMs: number): Promise<'drained' | 'timed-out'> {
    this.state = 'draining';
    if (this.inFlight === 0) return 'drained';

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timed-out'), timeoutMs);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve('drained');
      });
    });
  }
}

/**
 * How long to wait between becoming unready and starting to drain.
 *
 * A load balancer notices the readiness change on its own schedule, and
 * requests it already routed here arrive *after* the process knows it is
 * going away. Exiting the moment the last in-flight request finishes would
 * drop those. Zero in tests and short in production, because it is dead time
 * on every deploy.
 */
export const DEFAULT_PRE_DRAIN_DELAY_MS = 3_000;

/** How long to wait for in-flight requests before exiting regardless. */
export const DEFAULT_DRAIN_TIMEOUT_MS = 15_000;
