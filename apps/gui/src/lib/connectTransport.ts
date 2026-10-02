import { createConnectTransport } from "@connectrpc/connect-web";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { reportError } from "./errorReporter";
import { BACKEND_URL } from "./backendUrl";

export { BACKEND_URL };

const requestLoggingInterceptor: Interceptor = (next) => async (req) => {
  const requestId = crypto.randomUUID();
  req.header.set("x-request-id", requestId);
  const service = req.method.parent.typeName;
  const method = req.method.name;

  try {
    return await next(req);
  } catch (err) {
    // A request its caller cancelled — a stream torn down on navigation, a
    // page closing — has not failed. Reporting it as an error filled the log
    // stream (and every screenshot run's console) with `AbortError`s that
    // nobody could act on.
    if (isCancellation(err, req.signal)) throw err;
    reportError({
      message: `rpc failed: ${service}.${method}`,
      err,
      severity: "error",
      context: { requestId, service, method },
    });
    throw err;
  }
};

function isCancellation(err: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return err instanceof ConnectError && err.code === Code.Canceled;
}

export const transport = createConnectTransport({
  baseUrl: BACKEND_URL,
  interceptors: [requestLoggingInterceptor],
  fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
});
