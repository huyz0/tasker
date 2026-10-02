/**
 * `POST /mcp` - the streamable-HTTP transport for the MCP core (M36-T03,
 * ADR-0029), in JSON response mode and stateless: no session id, no SSE.
 *
 * Written against Node's request/response so `index.ts` can hand it the raw
 * request, and with its collaborators injected so it is tested without a
 * running server.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpMessage, JSONRPC, SUPPORTED_PROTOCOL_VERSIONS } from "./protocol";
import { createToolHost, loopbackCaller } from "./tools";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1024 * 1024;

export interface McpHttpOptions {
  /** Where the Connect listener is, e.g. `http://127.0.0.1:8080`. */
  connectBaseUrl: string;
  /** Browser origins allowed to call (the CORS allowlist). Requests without an Origin are not browsers. */
  allowedOrigins: string[];
  /** True when the Authorization header names a live principal. */
  authenticate: (authorization: string) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): number {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { ...(text ? { "Content-Type": "application/json" } : {}), ...headers });
  res.end(text);
  return status;
}

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", id: null, error: { code, message } });

/** Handles one request to MCP_PATH. Returns the HTTP status, for metrics. */
export async function handleMcpHttp(req: IncomingMessage, res: ServerResponse, opts: McpHttpOptions): Promise<number> {
  if (req.method !== "POST") {
    // No server-initiated stream (GET) and no sessions to end (DELETE).
    return send(res, 405, rpcError(JSONRPC.invalidRequest, "only POST is supported"), { Allow: "POST" });
  }
  // DNS rebinding: a page on another origin must not reach a local server
  // through the visitor's browser (MCP transport security guidance).
  const origin = req.headers.origin;
  if (origin && !opts.allowedOrigins.includes(origin)) {
    return send(res, 403, rpcError(JSONRPC.invalidRequest, "origin not allowed"));
  }
  const authorization = req.headers.authorization ?? "";
  if (!/^Bearer \S+$/.test(authorization) || !(await opts.authenticate(authorization))) {
    return send(res, 401, rpcError(JSONRPC.invalidRequest, "a valid Bearer token is required"), {
      "WWW-Authenticate": 'Bearer realm="tasker"',
    });
  }
  const version = req.headers["mcp-protocol-version"];
  if (typeof version === "string" && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return send(res, 400, rpcError(JSONRPC.invalidRequest, `unsupported MCP-Protocol-Version ${version}`));
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return send(res, 413, rpcError(JSONRPC.invalidRequest, "request body too large"));
    chunks.push(chunk as Buffer);
  }
  let message: unknown;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return send(res, 400, rpcError(JSONRPC.parseError, "request body is not JSON"));
  }

  const host = createToolHost(loopbackCaller(opts.connectBaseUrl, authorization, opts.fetchImpl));
  const response = await handleMcpMessage(message, host);
  // A notification or response from the client: accepted, nothing to say.
  if (response === null) return send(res, 202, undefined);
  return send(res, 200, response);
}
