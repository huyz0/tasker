// In-memory request counts for the plain (non-ConnectRPC) HTTP routes -
// auth, client-errors, debug/* - keyed by method+path+status. rpcMetrics.ts
// already covers ConnectRPC traffic; this fills the gap for everything
// dispatched through index.ts's raw http.createServer handler instead.
const countByKey = new Map<string, number>();

function keyFor(method: string, path: string, status: number): string {
  return `${method} ${path} ${status}`;
}

export function recordHttpRequest(method: string, path: string, status: number): void {
  const key = keyFor(method, path, status);
  countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
}

export interface HttpRequestCount {
  method: string;
  path: string;
  status: number;
  count: number;
}

export function getHttpRequestCounts(): HttpRequestCount[] {
  const counts: HttpRequestCount[] = [];
  for (const [key, count] of countByKey) {
    const [method, path, status] = key.split(" ");
    counts.push({ method: method!, path: path!, status: Number(status), count });
  }
  return counts.sort((a, b) => b.count - a.count);
}

// Test-only: reset accumulated state between test runs so one test's
// recordings don't leak into another's assertions.
export function resetHttpMetrics(): void {
  countByKey.clear();
}
