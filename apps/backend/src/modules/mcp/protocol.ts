/**
 * The Model Context Protocol's JSON-RPC core (M36, ADR-0029): lifecycle and
 * tools, nothing else. Transport-free - `handleMcpMessage` takes one parsed
 * JSON value and returns the JSON value to send back (or null for a
 * notification), so it is tested without a socket and mounted by `http.ts`.
 */

/** Newest first. The server answers with the client's version when it is here. */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const JSONRPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Read-only tools say so, so a client can run them without asking. */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
}

export interface ToolHost {
  tools: Tool[];
  /** Runs one tool. Throwing InvalidToolArguments becomes a JSON-RPC error; anything else is a tool error. */
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
}

/** Arguments that do not satisfy the tool's schema - a protocol error, not a tool failure. */
export class InvalidToolArguments extends Error {}

type Id = string | number;
type Response = { jsonrpc: "2.0"; id: Id | null; result?: unknown; error?: { code: number; message: string } };

const SERVER_INFO = { name: "tasker", title: "Tasker", version: "1.0.0" };

const INSTRUCTIONS =
  "Tasker is a task tracker for AI agents. The usual loop: whoami, then claim_next_task " +
  "(the most important ready task in a project), work on it, then set_task_status to finish " +
  "it or release_task with a handoff note to give it back. Record follow-up work with " +
  "create_task (discovered_from_task_id, blocked_by) and durable facts with record_belief.";

const error = (id: Id | null, code: number, message: string): Response => ({ jsonrpc: "2.0", id, error: { code, message } });
const ok = (id: Id, result: unknown): Response => ({ jsonrpc: "2.0", id, result });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * One JSON-RPC message in, one response out - or null when the message is a
 * notification (no `id`), which gets no response. Batches are refused: the
 * 2025-06-18 revision removed them.
 */
export async function handleMcpMessage(message: unknown, host: ToolHost): Promise<Response | null> {
  if (Array.isArray(message)) return error(null, JSONRPC.invalidRequest, "batch requests are not supported");
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(null, JSONRPC.invalidRequest, "not a JSON-RPC 2.0 request");
  }
  const hasId = "id" in message && message.id !== undefined;
  if (hasId && typeof message.id !== "string" && typeof message.id !== "number") {
    return error(null, JSONRPC.invalidRequest, "id must be a string or a number");
  }
  // Notifications - notifications/initialized, cancellations - need no answer.
  if (!hasId) return null;
  const id = message.id as Id;
  const params = isRecord(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return ok(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      // The catalogue is small and fixed, so it is one page; no cursor.
      return ok(id, { tools: host.tools });
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !host.tools.some((t) => t.name === name)) {
        return error(id, JSONRPC.invalidParams, `unknown tool: ${String(name)}`);
      }
      if (params.arguments !== undefined && !isRecord(params.arguments)) {
        return error(id, JSONRPC.invalidParams, "arguments must be an object");
      }
      try {
        return ok(id, await host.call(name, (params.arguments as Record<string, unknown>) ?? {}));
      } catch (e) {
        if (e instanceof InvalidToolArguments) return error(id, JSONRPC.invalidParams, e.message);
        return error(id, JSONRPC.internalError, "the tool failed unexpectedly");
      }
    }
    default:
      return error(id, JSONRPC.methodNotFound, `method not found: ${message.method}`);
  }
}
