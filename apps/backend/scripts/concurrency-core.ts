type Config = { concurrency: number; duration: number; fixture: number; instances: number; seed: number; maxOperations: number };

export function measurementConfig(args: string[]): Config {
  const config: Config = { concurrency: 4, duration: 3, fixture: 20, instances: 2, seed: 1, maxOperations: 20 };
  const fields: Record<string, [keyof Config, number, number]> = {
    '--concurrency': ['concurrency', 1, 1000], '--duration': ['duration', 1, 120],
    '--fixture': ['fixture', 0, 10000], '--instances': ['instances', 1, 4],
    '--seed': ['seed', 0, 4294967295], '--max-operations': ['maxOperations', 1, 50000],
  };
  const seen = new Set<string>();
  if (args.length % 2) throw new Error('Every measurement option requires an integer value.');
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index]!, raw = args[index + 1]!, field = fields[option];
    if (!field || seen.has(option) || !/^\d+$/.test(raw)) throw new Error('Unknown, repeated or malformed measurement option.');
    const value = Number(raw);
    if (value < field[1] || value > field[2]) throw new Error('Measurement option is outside its bounded range.');
    config[field[0]] = value;seen.add(option);
  }
  return config;
}

export function latencySummary(values: number[]) {
  if (!values.length) return { count: 0, p50: null, p95: null, p99: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1]!;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export function reconcileOutcomes(attempts: Array<{ key: string; acceptedId?: string }>, rows: Array<{ key: string; id: string }>) {
  const expected = new Set(attempts.map(attempt => attempt.key)), observed = new Map<string, string[]>();
  const result = { lost: 0, duplicates: 0, identityMismatch: 0, unexpected: 0, unresolvedCommitted: 0, unresolvedNotWritten: 0 };
  for (const row of rows) {
    if (!expected.has(row.key)) { result.unexpected++;continue; }
    const ids = observed.get(row.key) ?? [];ids.push(row.id);observed.set(row.key, ids);
  }
  for (const attempt of attempts) {
    const ids = observed.get(attempt.key) ?? [];
    result.duplicates += Math.max(0, ids.length - 1);
    if (attempt.acceptedId !== undefined) {
      if (!ids.includes(attempt.acceptedId)) result.lost++;
      if (ids.some(id => id !== attempt.acceptedId)) result.identityMismatch++;
    } else if (ids.length) result.unresolvedCommitted++;
    else result.unresolvedNotWritten++;
  }
  return result;
}
