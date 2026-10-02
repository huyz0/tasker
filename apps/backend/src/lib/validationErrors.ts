import { ConnectError, Code, type Interceptor } from "@connectrpc/connect";
import { ZodError } from "zod";

/**
 * Reports a request that failed its handler's schema as `InvalidArgument`.
 *
 * Every handler validates with `Schema.parse(req)`. A `ZodError` is not a
 * `ConnectError`, so Connect reported it as `Internal` — a caller who sent a
 * bad request was told the server had broken, and a retrying agent retried a
 * request that could never succeed (M30-T11). Innermost in the chain, so the
 * request log records the corrected code.
 */
export const validationErrorInterceptor: Interceptor = (next) => async (req) => {
  try {
    return await next(req);
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues
        .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
      throw new ConnectError(detail || "invalid request", Code.InvalidArgument, undefined, undefined, err);
    }
    throw err;
  }
};
