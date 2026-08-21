import { NodeTracerProvider, BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context, propagation, SpanStatusCode, type Span } from '@opentelemetry/api';
import { logger } from '../logger';

/**
 * Tracing (M11-T01), and the reason ADR-0004 said "not yet".
 *
 * ADR-0004 chose in-process counters over OpenTelemetry until this milestone,
 * on two grounds: the single binary must run with no external dependency, and
 * there was nothing deployed to trace. Both are answered here rather than
 * reversed — the SDK is always installed, but an exporter is created **only**
 * when an endpoint is configured.
 *
 * That distinction is the whole design. Without `OTEL_EXPORTER_OTLP_ENDPOINT`
 * the provider still runs, so spans exist, `traceparent` propagates, and every
 * log line carries a trace id — all in process, all free, and nothing ever
 * opens a socket to a collector that is not there. The standalone binary keeps
 * its promise; the M09 smoke test would fail loudly if it did not.
 *
 * The counters ADR-0004 built are kept, not replaced: they answer "how many"
 * cheaply and locally, and M11-T05 exposes them over `/metrics`. Traces answer
 * "why was *this one* slow", which is a different question.
 */

export interface TelemetryConfig {
  /** OTLP HTTP endpoint. Absent means "no exporter", not "localhost". */
  endpoint?: string;
  serviceName: string;
  serviceVersion: string;
  /** 0..1. Below 1, whole traces are dropped rather than individual spans. */
  sampleRatio: number;
  headers?: Record<string, string>;
}

export const DEFAULT_SERVICE_NAME = 'tasker-backend';

/**
 * Reads the standard OTel environment variables, so an operator configures
 * this the way they configure everything else that speaks OTLP rather than
 * learning names invented here.
 */
export function readTelemetryConfig(env: Record<string, string | undefined>): TelemetryConfig {
  const ratio = Number(env.OTEL_TRACES_SAMPLER_ARG);
  return {
    endpoint: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
    serviceName: env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
    serviceVersion: env.GIT_SHA || 'dev',
    // Not `|| 1`: an explicit 0 means "sample nothing", and must survive.
    sampleRatio: Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 1,
    headers: parseHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
  };
}

/** `key=value,key2=value2`, the format the OTel spec defines for this variable. */
export function parseHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    headers[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

let provider: NodeTracerProvider | null = null;

/**
 * Starts tracing. Idempotent, and safe to call with nothing configured.
 *
 * Returns whether an exporter was created, which is the only part that has an
 * operational cost.
 */
export function initTelemetry(config: TelemetryConfig): boolean {
  if (provider) return false;

  const processors: SpanProcessor[] = [];
  if (config.endpoint) {
    processors.push(
      // Batched, not simple: a span-per-request exported synchronously would
      // put a network round trip on the request path, which is the opposite of
      // what an observability tool is for.
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${config.endpoint.replace(/\/$/, '')}/v1/traces`, headers: config.headers }),
      ),
    );
  }

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion,
    }),
    spanProcessors: processors,
  });
  // The propagator is registered either way. Trace context crossing a process
  // boundary costs nothing and is what lets a deployment turn exporting on
  // without redeploying the services that only forward it.
  provider.register({ propagator: new W3CTraceContextPropagator() });

  logger.info(
    { exporting: Boolean(config.endpoint), serviceName: config.serviceName, sampleRatio: config.sampleRatio },
    'telemetry.started',
  );
  return Boolean(config.endpoint);
}

/** Flushes pending spans. Called on shutdown, before the process exits. */
export async function shutdownTelemetry(): Promise<void> {
  if (!provider) return;
  await provider.shutdown().catch((err) => logger.warn({ err }, 'telemetry.shutdown_failed'));
  provider = null;
}

/** Test-only: forget the provider so another config can be installed. */
export function resetTelemetryForTests(): void {
  provider = null;
}

export function getTracer() {
  return trace.getTracer(DEFAULT_SERVICE_NAME);
}

/**
 * The active trace and span ids, or nothing outside a span.
 *
 * Read by `logger.ts`'s mixin, which is what makes a log line paste-able into
 * a trace viewer (M11-T04).
 */
export function activeTraceIds(): { traceId: string; spanId: string } | null {
  const span = trace.getActiveSpan();
  if (!span) return null;
  const ctx = span.spanContext();
  // An all-zero trace id is the invalid one the API returns for a non-recording
  // span; putting it in a log line would send someone looking for a trace that
  // cannot exist.
  if (!ctx.traceId || ctx.traceId === '00000000000000000000000000000000') return null;
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

/** Serialises the active context into a carrier — the `traceparent` header. */
export function injectTraceContext(carrier: Record<string, string> = {}): Record<string, string> {
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Runs `fn` inside the trace context a carrier describes.
 *
 * A carrier with no `traceparent`, or an unparseable one, yields the current
 * context — so an event published before tracing existed still gets processed,
 * it just starts a new trace instead of continuing one.
 */
export function withExtractedContext<T>(carrier: Record<string, unknown>, fn: () => T): T {
  const extracted = propagation.extract(context.active(), carrier);
  return context.with(extracted, fn);
}

/** Records an error on a span and marks it failed, in one place. */
export function failSpan(span: Span, err: unknown): void {
  span.recordException(err as Error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
}
