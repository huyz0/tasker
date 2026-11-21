import type { Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';

type Options = { endpoint: string; header: string; value: string; signal: AbortSignal; timeoutMs?: number };

/** Extracted current controller behavior, before the cancellation correction. */
export function createMeasurementTransport(options: Options): Transport {
  const { endpoint, header, value, timeoutMs = 5000 } = options;
  return createConnectTransport({ baseUrl: endpoint, httpVersion: '1.1', defaultTimeoutMs: timeoutMs,
    interceptors: [next => async request => { request.header.set(header, value);return next(request); }] });
}
