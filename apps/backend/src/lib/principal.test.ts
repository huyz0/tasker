import { describe, it, expect } from "bun:test";
import { createContextValues } from "@connectrpc/connect";
import { ConnectError, Code } from "@connectrpc/connect";
import { currentUserIdKey, currentPrincipalKey, type Principal } from "../modules/auth/session";
import { requirePrincipal, requireUser } from "./authz";

const ctxWith = (set: (v: any) => void) => {
  const values = createContextValues();
  set(values);
  return values;
};

const agent: Principal = {
  kind: "agent",
  agentId: "agent-1",
  orgId: "org-1",
  tokenId: "tok-1",
  scopes: ["tasks:read"],
};

describe("requirePrincipal", () => {
  it("returns a user principal for a human session", () => {
    const values = ctxWith((v) => v.set(currentPrincipalKey, { kind: "user", userId: "user-1" }));
    expect(requirePrincipal(values)).toEqual({ kind: "user", userId: "user-1" });
  });

  it("returns an agent principal for a token", () => {
    const values = ctxWith((v) => v.set(currentPrincipalKey, agent));
    const p = requirePrincipal(values);
    expect(p.kind).toBe("agent");
    if (p.kind === "agent") {
      expect(p.agentId).toBe("agent-1");
      expect(p.orgId).toBe("org-1");
      expect(p.scopes).toEqual(["tasks:read"]);
    }
  });

  it("derives a user principal from currentUserIdKey alone", () => {
    // The human session path and every existing test set only this key. Losing
    // that would mean rewriting ~86 call sites' fixtures to prove a rename.
    const values = ctxWith((v) => v.set(currentUserIdKey, "user-2"));
    expect(requirePrincipal(values)).toEqual({ kind: "user", userId: "user-2" });
  });

  it("rejects an unauthenticated caller", () => {
    const values = createContextValues();
    expect(() => requirePrincipal(values)).toThrow(ConnectError);
    try {
      requirePrincipal(values);
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.Unauthenticated);
    }
  });
});

describe("requireUser", () => {
  it("returns the userId for a human", () => {
    const values = ctxWith((v) => v.set(currentPrincipalKey, { kind: "user", userId: "user-1" }));
    expect(requireUser(values)).toBe("user-1");
  });

  it("returns the userId when only currentUserIdKey is set", () => {
    const values = ctxWith((v) => v.set(currentUserIdKey, "user-3"));
    expect(requireUser(values)).toBe("user-3");
  });

  it("refuses an agent principal with PermissionDenied, not Unauthenticated", () => {
    // The distinction is the point: the agent IS authenticated. Answering 401
    // would tell a correctly-credentialled caller to go and authenticate again,
    // which is both wrong and an endless retry loop for an autonomous worker.
    const values = ctxWith((v) => v.set(currentPrincipalKey, agent));
    try {
      requireUser(values);
      throw new Error("expected requireUser to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ConnectError);
      expect((e as ConnectError).code).toBe(Code.PermissionDenied);
    }
  });

  it("rejects an unauthenticated caller as Unauthenticated", () => {
    expect(() => requireUser(createContextValues())).toThrow(ConnectError);
    try {
      requireUser(createContextValues());
    } catch (e) {
      expect((e as ConnectError).code).toBe(Code.Unauthenticated);
    }
  });
});

describe("the default for an un-migrated endpoint", () => {
  it("is refusal: every handler still calls requireUser, so a token reaches none of them", () => {
    // ADR-0008 puts agents behind deny-by-default. Renaming the old
    // requireUserId to requireUser rather than to requirePrincipal is what
    // implements that: an
    // endpoint accepts a token only once someone deliberately migrates it, so
    // the 86 existing call sites are closed to agents by construction rather
    // than by anyone remembering to close them.
    const values = ctxWith((v) => v.set(currentPrincipalKey, agent));
    expect(() => requireUser(values)).toThrow(/human/i);
  });
});
