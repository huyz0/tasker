import { createConnectTransport } from "@connectrpc/connect-web";
import type { Interceptor } from "@connectrpc/connect";

const BACKEND_URL = "http://localhost:8080";

const requestLoggingInterceptor: Interceptor = (next) => async (req) => {
  const requestId = crypto.randomUUID();
  req.header.set("x-request-id", requestId);
  const service = req.method.parent.typeName;
  const method = req.method.name;

  try {
    return await next(req);
  } catch (err) {
    console.error(`[rpc] ${service}.${method} failed (request-id: ${requestId}):`, err);
    throw err;
  }
};

export const transport = createConnectTransport({
  baseUrl: BACKEND_URL,
  interceptors: [requestLoggingInterceptor],
  fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
});
