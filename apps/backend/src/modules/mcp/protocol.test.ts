import { describe, it, expect } from "bun:test";
import { handleMcpMessage, InvalidToolArguments, JSONRPC, SUPPORTED_PROTOCOL_VERSIONS, type ToolHost } from "./protocol";

/** M36-T01 (ADR-0029): the lifecycle and tools methods, against a fake catalogue. */
const calls: { name: string; args: Record<string, unknown> }[] = [];
const host: ToolHost = {
  tools: [{ name: "echo", title: "Echo", description: "Echoes", inputSchema: { type: "object", properties: { text: { type: "string" } } } }],
  async call(name, args) {
    calls.push({ name, args });
    if (args.bad) throw new InvalidToolArguments("text is required");
    if (args.boom) throw new Error("unexpected");
    return { content: [{ type: "text", text: String(args.text) }] };
  },
};
const rpc = (method: string, params?: unknown, id: unknown = 1) => handleMcpMessage({ jsonrpc: "2.0", id, method, params }, host);

describe("MCP protocol core (M36-T01)", () => {
  it("initializes with the client's protocol version when supported, else the latest", async () => {
    const res: any = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(res.result.protocolVersion).toBe("2025-03-26");
    expect(res.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(res.result.serverInfo.name).toBe("tasker");
    expect(res.result.instructions).toContain("claim_next_task");
    const future: any = await rpc("initialize", { protocolVersion: "2099-01-01" });
    expect(future.result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it("answers ping and lists tools, keeping the request id", async () => {
    expect(await rpc("ping", undefined, "abc")).toEqual({ jsonrpc: "2.0", id: "abc", result: {} });
    const list: any = await rpc("tools/list");
    expect(list.result.tools.map((t: any) => t.name)).toEqual(["echo"]);
  });

  it("calls a tool with its arguments and returns its result", async () => {
    calls.length = 0;
    const res: any = await rpc("tools/call", { name: "echo", arguments: { text: "hi" } });
    expect(res.result).toEqual({ content: [{ type: "text", text: "hi" }] });
    expect(calls).toEqual([{ name: "echo", args: { text: "hi" } }]);
    // Arguments are optional.
    expect(((await rpc("tools/call", { name: "echo" })) as any).result.content[0].text).toBe("undefined");
  });

  it("reports protocol problems as JSON-RPC errors", async () => {
    const code = async (p: Promise<any>) => (await p).error?.code;
    expect(await code(rpc("tools/call", { name: "nope" }))).toBe(JSONRPC.invalidParams);
    expect(await code(rpc("tools/call", { name: "echo", arguments: [1] }))).toBe(JSONRPC.invalidParams);
    expect(await code(rpc("tools/call", { name: "echo", arguments: { bad: true } }))).toBe(JSONRPC.invalidParams);
    expect(await code(rpc("tools/call", { name: "echo", arguments: { boom: true } }))).toBe(JSONRPC.internalError);
    expect(await code(rpc("resources/list"))).toBe(JSONRPC.methodNotFound);
    expect(await code(handleMcpMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }], host))).toBe(JSONRPC.invalidRequest);
    expect(await code(handleMcpMessage({ id: 1, method: "ping" }, host))).toBe(JSONRPC.invalidRequest);
    expect(await code(handleMcpMessage("ping", host))).toBe(JSONRPC.invalidRequest);
    expect(await code(rpc("ping", undefined, null))).toBe(JSONRPC.invalidRequest);
    expect(await code(rpc("ping", undefined, { nested: 1 }))).toBe(JSONRPC.invalidRequest);
  });

  it("does not answer notifications", async () => {
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, host)).toBeNull();
    expect(await handleMcpMessage({ jsonrpc: "2.0", method: "tools/call", params: { name: "echo" } }, host)).toBeNull();
  });
});
