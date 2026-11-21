import { Code, ConnectError, type Transport } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';

type Options = { endpoint: string; header: string; value: string; signal: AbortSignal; timeoutMs?: number };

/** Unary measurement RPCs use Bun's native fetch and own their whole-call bound. */
export function createMeasurementTransport(options: Options): Transport {
  const { endpoint, header, value, timeoutMs = 5000 } = options;
  return createConnectTransport({ baseUrl: endpoint, useBinaryFormat: true, defaultTimeoutMs: timeoutMs,
    interceptors: [next => async request => {
      request.header.set(header, value);
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new ConnectError('Measurement request deadline exceeded.', Code.DeadlineExceeded)), timeoutMs);
      try { return await next({ ...request, signal: AbortSignal.any([request.signal, options.signal, deadline.signal]) }); }
      finally { clearTimeout(timer); }
    }] });
}
