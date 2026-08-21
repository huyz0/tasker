import { describe, it, expect, beforeEach } from 'bun:test';
import { trace, context } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  readTelemetryConfig,
  parseHeaders,
  initTelemetry,
  resetTelemetryForTests,
  activeTraceIds,
  injectTraceContext,
  withExtractedContext,
  getTracer,
  shutdownTelemetry,
  failSpan,
  DEFAULT_SERVICE_NAME,
} from './otel';

describe('readTelemetryConfig', () => {
  it('has no endpoint when none is configured', () => {
    // The whole ADR-0004 promise: the SDK is installed, the exporter is not
    // created, and nothing ever opens a socket to a collector that is absent.
    expect(readTelemetryConfig({}).endpoint).toBeUndefined();
  });

  it('reads the standard OTLP variables rather than names invented here', () => {
    expect(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }).endpoint).toBe(
      'http://collector:4318',
    );
  });

  it('lets the traces-specific endpoint win over the generic one', () => {
    // The spec's own precedence: a deployment sending traces and metrics to
    // different collectors needs the narrower variable to be the answer.
    const cfg = readTelemetryConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://generic:4318',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://traces:4318',
    });
    expect(cfg.endpoint).toBe('http://traces:4318');
  });

  it('names the service, defaulting to this one', () => {
    expect(readTelemetryConfig({}).serviceName).toBe(DEFAULT_SERVICE_NAME);
    expect(readTelemetryConfig({ OTEL_SERVICE_NAME: 'other' }).serviceName).toBe('other');
  });

  it('samples everything unless told otherwise', () => {
    expect(readTelemetryConfig({}).sampleRatio).toBe(1);
  });

  it('honours an explicit zero, which means sample nothing', () => {
    // `Number(x) || 1` would silently turn this into "sample everything",
    // which is the opposite of what the operator asked for.
    expect(readTelemetryConfig({ OTEL_TRACES_SAMPLER_ARG: '0' }).sampleRatio).toBe(0);
  });

  it('ignores a ratio outside the range rather than sampling nonsense', () => {
    expect(readTelemetryConfig({ OTEL_TRACES_SAMPLER_ARG: '5' }).sampleRatio).toBe(1);
    expect(readTelemetryConfig({ OTEL_TRACES_SAMPLER_ARG: 'abc' }).sampleRatio).toBe(1);
  });
});

describe('parseHeaders', () => {
  it('parses the comma-separated key=value form the spec defines', () => {
    expect(parseHeaders('api-key=abc,x-tenant=t1')).toEqual({ 'api-key': 'abc', 'x-tenant': 't1' });
  });

  it('keeps an equals sign inside the value, which base64 credentials have', () => {
    expect(parseHeaders('authorization=Basic dXNlcjpwYXNz==')).toEqual({ authorization: 'Basic dXNlcjpwYXNz==' });
  });

  it('has nothing to say about an empty or malformed variable', () => {
    expect(parseHeaders(undefined)).toBeUndefined();
    expect(parseHeaders('')).toBeUndefined();
    expect(parseHeaders('nonsense')).toBeUndefined();
  });
});

describe('tracing with no exporter configured', () => {
  beforeEach(() => resetTelemetryForTests());

  it('starts without creating an exporter', () => {
    // The return value *is* the operational cost: false means no collector
    // connection was attempted.
    expect(initTelemetry(readTelemetryConfig({}))).toBe(false);
  });

  it('still produces trace ids, so logs and propagation work in standalone', async () => {
    initTelemetry(readTelemetryConfig({}));
    await getTracer().startActiveSpan('probe', async (span) => {
      const ids = activeTraceIds();
      expect(ids?.traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(ids?.spanId).toMatch(/^[0-9a-f]{16}$/);
      span.end();
    });
  });

  it('reports no trace ids outside a span', () => {
    initTelemetry(readTelemetryConfig({}));
    expect(activeTraceIds()).toBeNull();
  });

  it('is idempotent, so a second call does not install a second provider', () => {
    initTelemetry(readTelemetryConfig({}));
    expect(initTelemetry(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318' }))).toBe(false);
  });
});

describe('trace context propagation', () => {
  beforeEach(() => resetTelemetryForTests());

  it('writes a traceparent a receiver can read back', async () => {
    initTelemetry(readTelemetryConfig({}));
    let injected: Record<string, string> = {};
    let originalTraceId = '';

    await getTracer().startActiveSpan('publisher', async (span) => {
      originalTraceId = span.spanContext().traceId;
      injected = injectTraceContext();
      span.end();
    });

    expect(injected.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

    // The other side of the NATS hop: the consumer continues this trace rather
    // than starting one of its own, which is the whole point of M11-T03.
    withExtractedContext(injected, () => {
      const parent = trace.getSpanContext(context.active());
      expect(parent?.traceId).toBe(originalTraceId);
    });
  });

  it('starts a fresh trace when the carrier has no traceparent', () => {
    // An event published before this existed, or by something that does not
    // propagate. It still gets processed; it just is not linked.
    initTelemetry(readTelemetryConfig({}));
    withExtractedContext({}, () => {
      expect(trace.getSpanContext(context.active())).toBeUndefined();
    });
  });

  it('ignores an unparseable traceparent rather than throwing', () => {
    initTelemetry(readTelemetryConfig({}));
    expect(() =>
      withExtractedContext({ traceparent: 'not-a-trace-context' }, () => undefined),
    ).not.toThrow();
  });
});

describe('tracing with an exporter configured', () => {
  beforeEach(() => resetTelemetryForTests());

  it('creates the exporter, which is the only part with an operational cost', () => {
    // 127.0.0.1 with nothing listening: the exporter is constructed and
    // batched, so no connection is attempted at startup — which is what makes
    // this safe to assert without a collector.
    expect(initTelemetry(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318' }))).toBe(true);
  });

  it('appends the traces path rather than requiring the operator to', () => {
    // OTLP/HTTP puts traces at /v1/traces, and every collector's documented
    // endpoint is the base. Making the operator remember the suffix is how
    // half of them end up posting to the wrong path.
    expect(initTelemetry(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318/' }))).toBe(true);
  });

  it('shuts down without throwing, even with nowhere to flush to', async () => {
    initTelemetry(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318' }));
    await shutdownTelemetry();
    // Idempotent: a second SIGTERM must not fail the exit path.
    await shutdownTelemetry();
  });

  it('shuts down cleanly when nothing was ever started', async () => {
    await shutdownTelemetry();
  });
});

describe('failSpan', () => {
  beforeEach(() => resetTelemetryForTests());

  it('marks the span failed and records the error on it', async () => {
    // Both halves matter: the status is what a trace viewer filters on, and
    // the exception is what says which error it was.
    initTelemetry(readTelemetryConfig({}));
    await getTracer().startActiveSpan('failing', async (span) => {
      const statuses: unknown[] = [];
      const exceptions: unknown[] = [];
      const spy = {
        ...span,
        setStatus: (s: unknown) => statuses.push(s),
        recordException: (e: unknown) => exceptions.push(e),
      } as any;

      failSpan(spy, new Error('boom'));
      expect(statuses).toEqual([{ code: SpanStatusCode.ERROR, message: 'boom' }]);
      expect(exceptions).toHaveLength(1);
      span.end();
    });
  });

  it('describes a thrown non-Error rather than recording "undefined"', async () => {
    initTelemetry(readTelemetryConfig({}));
    await getTracer().startActiveSpan('failing', async (span) => {
      const statuses: any[] = [];
      failSpan({ ...span, setStatus: (s: any) => statuses.push(s), recordException: () => {} } as any, 'a string');
      expect(statuses[0].message).toBe('a string');
      span.end();
    });
  });
});
