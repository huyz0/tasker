// In-memory counters for domain events (task created, project created, ...),
// distinct from rpcMetrics.ts's per-RPC-method counts: this only increments
// on a confirmed successful mutation, so it answers "how much real product
// activity is happening" rather than "how many requests hit this endpoint"
// (which also includes failed/rejected attempts). A debugging aid for local
// volume visibility, not a durable metrics store.
const countByEvent = new Map<string, number>();

export function recordBusinessEvent(eventName: string): void {
  countByEvent.set(eventName, (countByEvent.get(eventName) ?? 0) + 1);
}

export function getBusinessEventCounts(): Record<string, number> {
  return Object.fromEntries([...countByEvent.entries()].sort((a, b) => b[1] - a[1]));
}

// Test-only: reset accumulated state between test runs so one test's
// recordings don't leak into another's assertions.
export function resetBusinessEvents(): void {
  countByEvent.clear();
}
