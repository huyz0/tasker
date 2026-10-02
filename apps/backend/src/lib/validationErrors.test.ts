import { describe, it, expect } from "bun:test";
import { ConnectError, Code } from "@connectrpc/connect";
import { z } from "zod";
import { validationErrorInterceptor } from "./validationErrors";

/**
 * M30-T11: every handler validates with `Schema.parse(req)`, and a ZodError
 * left the handler as an unknown error - which Connect reports as Internal.
 * A caller sending a bad request was told the server broke.
 */
describe("validationErrorInterceptor", () => {
  const call = (handler: () => Promise<any>) => validationErrorInterceptor(handler as any)({} as any);

  it("turns a schema failure into InvalidArgument naming the field", async () => {
    const err = await call(async () => z.object({ orgId: z.string().min(1, "orgId is required") }).parse({ orgId: "" }))
      .catch((e) => e);
    expect(err).toBeInstanceOf(ConnectError);
    expect(err.code).toBe(Code.InvalidArgument);
    expect(err.rawMessage).toContain("orgId");
    expect(err.rawMessage).toContain("orgId is required");
  });

  it("passes every other error and every result through untouched", async () => {
    const denied = new ConnectError("no", Code.PermissionDenied);
    expect(await call(async () => { throw denied; }).catch((e) => e)).toBe(denied);
    const boom = new Error("boom");
    expect(await call(async () => { throw boom; }).catch((e) => e)).toBe(boom);
    expect(await call(async () => "ok") as unknown).toBe("ok");
  });
});
