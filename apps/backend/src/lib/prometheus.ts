/**
 * Rendering the counters ADR-0004 built into Prometheus exposition format
 * (M11-T05).
 *
 * ADR-0004 kept metrics in process and flushed summaries to the log stream,
 * because there was nothing deployed to scrape them. M11 changes that half of
 * the premise and not the other: the counters stay exactly where they are, and
 * this is a *view* of them. Nothing new is measured here, and nothing is
 * measured twice.
 *
 * A hand-written renderer rather than `prom-client`, for the same reason
 * ADR-0004 gave: the standalone binary should not carry a metrics library to
 * emit four families of numbers it already has in a Map. The format is a
 * documented line protocol, and the escaping rules below are the whole of it.
 */

export interface MetricSample {
  labels?: Record<string, string>;
  value: number;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  samples: MetricSample[];
}

/**
 * Label values are arbitrary strings — RPC method names are not, but route
 * paths and error codes reach here from callers. Backslash, newline and quote
 * are the three characters that would otherwise end the value early and
 * corrupt every line after it.
 */
export function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function renderLabels(labels?: Record<string, string>): string {
  const entries = Object.entries(labels ?? {}).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(String(v))}"`).join(',')}}`;
}

/**
 * Renders families to the text exposition format.
 *
 * A family with no samples still emits its `# HELP`/`# TYPE` header: a series
 * that exists but is currently zero and a series that does not exist are
 * different answers, and a dashboard built on the first should not break the
 * first time nothing has happened yet.
 */
export function renderMetrics(families: MetricFamily[]): string {
  const lines: string[] = [];
  for (const family of families) {
    lines.push(`# HELP ${family.name} ${family.help.replace(/\n/g, ' ')}`);
    lines.push(`# TYPE ${family.name} ${family.type}`);
    for (const sample of family.samples) {
      // Prometheus rejects a line with a non-finite value; skipping it loses
      // one number, emitting it invalidates the whole scrape.
      if (!Number.isFinite(sample.value)) continue;
      lines.push(`${family.name}${renderLabels(sample.labels)} ${sample.value}`);
    }
  }
  // Trailing newline: the format requires it, and some scrapers drop the last
  // line without one.
  return lines.join('\n') + '\n';
}

/**
 * Exactly the shapes the existing counters already return — `getRpcMethodStats`,
 * `getHttpRequestCounts` and `getBusinessEventCounts`. Reshaping them at the
 * call site would put a second definition of "what a metric is" in the server
 * file, which is where the two would drift apart.
 */
export interface CounterSources {
  rpc: Array<{ method: string; count: number; errorCount?: number; p50Ms?: number; p99Ms?: number }>;
  http: Array<{ method: string; path: string; status: number; count: number }>;
  businessEvents: Record<string, number>;
  uptimeSeconds: number;
}

/**
 * The families this service exposes.
 *
 * Latency goes out as a summary with explicit quantile labels rather than a
 * histogram: `rpcMetrics` already computes percentiles per method and keeps no
 * buckets, so inventing buckets here would mean inventing the numbers in them.
 * A summary says exactly what is known and no more.
 */
export function buildMetricFamilies(sources: CounterSources): MetricFamily[] {
  const rpcTotal: MetricSample[] = [];
  const rpcErrors: MetricSample[] = [];
  const rpcLatency: MetricSample[] = [];

  for (const row of sources.rpc) {
    // `rpcMetrics` keys on the full "Service/Method" string, which is already
    // the identity a dashboard groups by. Splitting it into two labels here
    // would be guessing at a separator the recorder never promised.
    const labels = { method: row.method };
    rpcTotal.push({ labels, value: row.count });
    rpcErrors.push({ labels, value: row.errorCount ?? 0 });
    for (const [quantile, value] of [['0.5', row.p50Ms], ['0.99', row.p99Ms]] as const) {
      if (typeof value === 'number') {
        // Seconds, not milliseconds: Prometheus convention is base units, and
        // a dashboard that has to know which one this service chose is a
        // dashboard that will eventually get it wrong.
        rpcLatency.push({ labels: { ...labels, quantile }, value: value / 1000 });
      }
    }
  }

  return [
    {
      name: 'tasker_rpc_requests_total',
      help: 'RPC calls handled, by method.',
      type: 'counter',
      samples: rpcTotal,
    },
    {
      name: 'tasker_rpc_errors_total',
      help: 'RPC calls that ended in an error, by method.',
      type: 'counter',
      samples: rpcErrors,
    },
    {
      name: 'tasker_rpc_duration_seconds',
      help: 'RPC latency percentiles, as measured in process.',
      type: 'summary',
      samples: rpcLatency,
    },
    {
      name: 'tasker_http_requests_total',
      help: 'Non-RPC HTTP requests, by method, route and status.',
      type: 'counter',
      samples: sources.http.map((row) => ({
        labels: { method: row.method, route: row.path, status: String(row.status) },
        value: row.count,
      })),
    },
    {
      name: 'tasker_domain_events_total',
      help: 'Domain events published, by subject.',
      type: 'counter',
      samples: Object.entries(sources.businessEvents).map(([subject, value]) => ({ labels: { subject }, value })),
    },
    {
      name: 'tasker_uptime_seconds',
      help: 'Seconds since this process started serving.',
      type: 'gauge',
      samples: [{ value: sources.uptimeSeconds }],
    },
  ];
}

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
