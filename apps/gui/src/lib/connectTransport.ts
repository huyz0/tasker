import { createConnectTransport } from "@connectrpc/connect-web";
import type { Interceptor } from "@connectrpc/connect";
import { reportError } from "./errorReporter";

const BACKEND_URL = "http://localhost:8080";

const requestLoggingInterceptor: Interceptor = (next) => async (req) => {
  const requestId = crypto.randomUUID();
  req.header.set("x-request-id", requestId);
  const service = req.method.parent.typeName;
  const method = req.method.name;

  try {
    return await next(req);
  } catch (err) {
    reportError({
      message: `rpc failed: ${service}.${method}`,
      err,
      severity: "error",
      context: { requestId, service, method },
    });
    throw err;
  }
};

export const transport = createConnectTransport({
  baseUrl: BACKEND_URL,
  interceptors: [requestLoggingInterceptor],
  fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
});
