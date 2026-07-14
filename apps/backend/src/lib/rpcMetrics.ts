// In-memory per-RPC-method latency tracking, so "is this endpoint slow"
// can be answered from a running process without external metrics
// infrastructure. Samples are capped per method to bound memory - this is
// a debugging aid, not a durable metrics store (use OBS-20's /metrics
// endpoint or a real metrics backend for that).
const MAX_SAMPLES_PER_METHOD = 500;

interface MethodStats {
  method: string;
  count: number;
  errorCount: number;
  minMs: number;
  p50Ms: number;
  p99Ms: number;
  maxMs: number;
}

const samplesByMethod = new Map<string, number[]>();
const errorCountByMethod = new Map<string, number>();

export function recordRpcDuration(service: string, method: string, durationMs: number, isError: boolean): void {
  const key = `${service}/${method}`;
  const samples = samplesByMethod.get(key) ?? [];
  samples.push(durationMs);
  if (samples.length > MAX_SAMPLES_PER_METHOD) samples.shift();
  samplesByMethod.set(key, samples);
  if (isError) errorCountByMethod.set(key, (errorCountByMethod.get(key) ?? 0) + 1);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

export function getRpcMethodStats(): MethodStats[] {
  const stats: MethodStats[] = [];
  for (const [method, samples] of samplesByMethod) {
    if (samples.length === 0) continue;
    const sorted = [...samples].sort((a, b) => a - b);
    stats.push({
      method,
      count: samples.length,
      errorCount: errorCountByMethod.get(method) ?? 0,
      minMs: sorted[0]!,
      p50Ms: percentile(sorted, 50),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1]!,
    });
  }
  return stats.sort((a, b) => b.p99Ms - a.p99Ms);
}

// Test-only: reset accumulated state between test runs so one test's
// recordings don't leak into another's assertions.
export function resetRpcMetrics(): void {
  samplesByMethod.clear();
  errorCountByMethod.clear();
}
