import { describe, it, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { normalizeEventFilters, filtersMatch, signDelivery, WEBHOOK_EVENT_TYPES } from "./events";

describe("webhook events (M37)", () => {
  it("accepts exact types, entity wildcards and *, de-duplicated", () => {
    expect(normalizeEventFilters(["task.created", "task.*", "*", "task.created"])).toEqual(["task.created", "task.*", "*"]);
    expect(() => normalizeEventFilters(["task"])).toThrow(/unknown event "task"/);
    expect(() => normalizeEventFilters(["*.created"])).toThrow(/unknown event/);
  });

  it("matches filters to event types, and a ping to everything", () => {
    expect(filtersMatch(["task.*"], "task.unblocked")).toBe(true);
    expect(filtersMatch(["task.*"], "tasknote.created")).toBe(false);
    expect(filtersMatch(["task.created"], "task.updated")).toBe(false);
    expect(filtersMatch(["*"], "tasknote.deleted")).toBe(true);
    expect(filtersMatch(["tasknote.created"], "ping")).toBe(true);
    for (const t of WEBHOOK_EVENT_TYPES) expect(filtersMatch([t], t)).toBe(true);
  });

  it("signs \"<timestamp>.<body>\" so a receiver can verify it with the secret alone", () => {
    const body = JSON.stringify({ id: "evt-1", type: "task.created" });
    const sig = signDelivery("whsec_test", 1790000000, body);
    const expected = createHmac("sha256", "whsec_test").update(`1790000000.${body}`).digest("hex");
    expect(sig).toBe(`sha256=${expected}`);
    // Any change to the timestamp or body breaks it.
    expect(signDelivery("whsec_test", 1790000001, body)).not.toBe(sig);
    expect(signDelivery("whsec_test", 1790000000, body + " ")).not.toBe(sig);
  });
});
