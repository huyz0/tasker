import { describe, it, expect } from 'bun:test';
import { renderMetrics, buildMetricFamilies, escapeLabelValue, PROMETHEUS_CONTENT_TYPE, type MetricSample } from './prometheus';

const sources = (over: Partial<Parameters<typeof buildMetricFamilies>[0]> = {}) => ({
  rpc: [],
  http: [],
  businessEvents: {},
  uptimeSeconds: 0,
  ...over,
});

describe('escapeLabelValue', () => {
  it('escapes the three characters that would end a value early', () => {
    // Anything else in a label value is legal; these three would corrupt every
    // line after the one they appear in.
    expect(escapeLabelValue('a"b')).toBe('a\\"b');
    expect(escapeLabelValue('a\\b')).toBe('a\\\\b');
    expect(escapeLabelValue('a\nb')).toBe('a\\nb');
  });

  it('escapes the backslash before the quote, not after', () => {
    // Escaping in the other order turns `\"` into `\\"`, which reads as an
    // escaped backslash followed by a value terminator.
    expect(escapeLabelValue('\\"')).toBe('\\\\\\"');
  });
});

describe('renderMetrics', () => {
  it('emits HELP and TYPE before the samples', () => {
    const out = renderMetrics([
      { name: 'x_total', help: 'How many x.', type: 'counter', samples: [{ value: 3 }] },
    ]);
    expect(out).toBe('# HELP x_total How many x.\n# TYPE x_total counter\nx_total 3\n');
  });

  it('keeps the header for a family with no samples yet', () => {
    // A series that exists but is zero and one that does not exist are
    // different answers; a dashboard built on the first should not break the
    // first time nothing has happened.
    const out = renderMetrics([{ name: 'x_total', help: 'h', type: 'counter', samples: [] }]);
    expect(out).toContain('# TYPE x_total counter');
  });

  it('renders labels in the exposition format', () => {
    const out = renderMetrics([
      { name: 'x', help: 'h', type: 'gauge', samples: [{ labels: { a: '1', b: 'two' }, value: 5 }] },
    ]);
    expect(out).toContain('x{a="1",b="two"} 5');
  });

  it('omits empty labels rather than emitting a="" ', () => {
    const out = renderMetrics([{ name: 'x', help: 'h', type: 'gauge', samples: [{ labels: { a: '' }, value: 1 }] }]);
    expect(out).toContain('x 1');
  });

  it('skips a non-finite value instead of invalidating the scrape', () => {
    // Prometheus rejects the whole response on one bad line, so losing one
    // number beats losing every number.
    const out = renderMetrics([
      { name: 'x', help: 'h', type: 'gauge', samples: [{ value: NaN }, { value: 2 }] },
    ]);
    expect(out).not.toContain('NaN');
    expect(out).toContain('x 2');
  });

  it('flattens a multi-line help string, which would otherwise break the format', () => {
    const out = renderMetrics([{ name: 'x', help: 'one\ntwo', type: 'gauge', samples: [] }]);
    expect(out).toContain('# HELP x one two');
  });

  it('renders a sample with no labels at all', () => {
    const sample: MetricSample = { value: 1 };
    expect(renderMetrics([{ name: 'x', help: 'h', type: 'gauge', samples: [sample] }])).toContain('x 1');
  });

  it('ends with a newline, which some scrapers need to see the last line', () => {
    expect(renderMetrics([{ name: 'x', help: 'h', type: 'gauge', samples: [{ value: 1 }] }]).endsWith('\n')).toBe(true);
  });
});

describe('buildMetricFamilies', () => {
  it('exposes RPC counts, errors and latency for each method', () => {
    const families = buildMetricFamilies(
      sources({ rpc: [{ method: 'TaskService/CreateTask', count: 7, errorCount: 2, p50Ms: 12, p99Ms: 250 }] }),
    );
    const out = renderMetrics(families);

    expect(out).toContain('tasker_rpc_requests_total{method="TaskService/CreateTask"} 7');
    expect(out).toContain('tasker_rpc_errors_total{method="TaskService/CreateTask"} 2');
  });

  it('reports latency in seconds, as Prometheus convention requires', () => {
    // A dashboard that has to know which unit this service chose is one that
    // will eventually get it wrong.
    const out = renderMetrics(buildMetricFamilies(sources({ rpc: [{ method: 'm', count: 1, p99Ms: 250 }] })));
    expect(out).toContain('quantile="0.99"} 0.25');
  });

  it('emits no quantile for a percentile that was never computed', () => {
    const out = renderMetrics(buildMetricFamilies(sources({ rpc: [{ method: 'm', count: 1 }] })));
    expect(out).not.toContain('quantile=');
  });

  it('treats a method with no recorded errors as zero, not as absent', () => {
    // `rate(errors[5m])` on a series that only appears after the first failure
    // shows nothing until something breaks, which is the wrong time to
    // discover the panel is empty.
    const out = renderMetrics(buildMetricFamilies(sources({ rpc: [{ method: 'm', count: 4 }] })));
    expect(out).toContain('tasker_rpc_errors_total{method="m"} 0');
  });

  it('labels HTTP counts by method, route and status', () => {
    const out = renderMetrics(
      buildMetricFamilies(sources({ http: [{ method: 'GET', path: '/api/auth/session', status: 200, count: 9 }] })),
    );
    expect(out).toContain('tasker_http_requests_total{method="GET",route="/api/auth/session",status="200"} 9');
  });

  it('labels domain events by subject', () => {
    const out = renderMetrics(buildMetricFamilies(sources({ businessEvents: { 'domain.task.created': 4 } })));
    expect(out).toContain('tasker_domain_events_total{subject="domain.task.created"} 4');
  });

  it('exposes uptime as a gauge', () => {
    const out = renderMetrics(buildMetricFamilies(sources({ uptimeSeconds: 42 })));
    expect(out).toContain('tasker_uptime_seconds 42');
  });

  it('produces a scrapeable document from nothing at all', () => {
    // The state a freshly started process is in. Every family present, no
    // samples, no syntax errors.
    const out = renderMetrics(buildMetricFamilies(sources()));
    for (const line of out.trim().split('\n')) {
      expect(line.startsWith('#') || /^[a-z_]+(\{.*\})? -?[\d.]+$/.test(line)).toBe(true);
    }
  });
});

describe('PROMETHEUS_CONTENT_TYPE', () => {
  it('names the version scrapers negotiate on', () => {
    expect(PROMETHEUS_CONTENT_TYPE).toContain('version=0.0.4');
  });
});
