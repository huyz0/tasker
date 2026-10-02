import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import type { Interceptor } from "@connectrpc/connect";
import { AuthService, TaskService, TaskNoteService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey, currentUserIdKey } from "../auth/session";
import { resolvePrincipal } from "../../lib/authenticate";
import { validationErrorInterceptor } from "../../lib/validationErrors";
import { createAuthHandler } from "../auth/auth.handler";
import { createTaskManagementHandler } from "../tasks/tasks.handler";
import { createTaskNotesHandler } from "../tasks/task_notes.handler";
import { createAgentsHandler } from "../agents/agents.handler";
import { handleMcpHttp, MCP_PATH } from "./http";

/**
 * M36-T03: MCP end to end, in process but over real sockets. A real HTTP
 * server carries both the Connect adapter (with the same session interceptor
 * shape as index.ts) and `/mcp`; the agent authenticates with a real minted
 * token; every tool call travels MCP -> loopback HTTP -> Connect -> handler ->
 * database, so authentication and scopes are the RPC's own (ADR-0029).
 */
describe("MCP over HTTP (M36-T03)", () => {
  let server: http.Server;
  let base = "";
  let token = "";
  let readOnlyToken = "";
  let projectId = "";
  let db: any;

  beforeAll(async () => {
    const setup = await setupIntegrationTest();
    db = setup.db;
    const stamp = Date.now() + "-" + Math.random().toString(36).slice(2);
    const orgId = "org-mcp-" + stamp;
    const adminId = "user-mcp-" + stamp;
    projectId = "proj-mcp-" + stamp;
    await seedOrgWithAdmin(db, { orgId, userId: adminId, name: "MCP Org" });
    await seedProject(db, { orgId, userId: adminId, templateId: "tmpl-mcp-" + stamp, projectId, name: "P" });
    await db.insert(schemaSqlite.agentRoles).values({ id: "role-mcp-" + stamp, orgId, name: "R", systemPrompt: "p", capabilities: "[]" });
    await db.insert(schemaSqlite.agents).values({ id: "agent-mcp-" + stamp, orgId, agentRoleId: "role-mcp-" + stamp, name: "Scout" });
    const admin = makeAuthContext(adminId);
    const agents = createAgentsHandler(db, setup.nc);
    token = (await agents.createAgentToken({ agentId: "agent-mcp-" + stamp, name: "mcp", scopes: ["tasks:read", "tasks:write", "comments:write"] }, admin)).plaintext;
    readOnlyToken = (await agents.createAgentToken({ agentId: "agent-mcp-" + stamp, name: "ro", scopes: ["tasks:read"] }, admin)).plaintext;
    const tasks = createTaskManagementHandler(db, setup.nc);
    await tasks.createTask({ projectId, title: "Low", status: "todo", description: "", priority: 4 }, admin);
    await tasks.createTask({ projectId, title: "Urgent", status: "todo", description: "", priority: 1 }, admin);

    const session: Interceptor = (next) => async (req) => {
      const principal = await resolvePrincipal(db, { cookie: req.header.get("cookie"), authorization: req.header.get("authorization") });
      req.contextValues.set(currentPrincipalKey, principal);
      req.contextValues.set(currentUserIdKey, principal?.kind === "user" ? principal.userId : null);
      return next(req);
    };
    const connect = connectNodeAdapter({
      interceptors: [session, validationErrorInterceptor],
      routes: (router) => {
        router.service(AuthService as any, createAuthHandler(db) as any);
        router.service(TaskService as any, createTaskManagementHandler(db, setup.nc));
        router.service(TaskNoteService as any, createTaskNotesHandler(db, setup.nc));
      },
    });
    server = http.createServer(async (req, res) => {
      if (req.url === MCP_PATH) {
        await handleMcpHttp(req, res, {
          connectBaseUrl: base,
          allowedOrigins: ["http://localhost:5173"],
          authenticate: async (authorization) => (await resolvePrincipal(db, { cookie: null, authorization })) !== null,
        });
        return;
      }
      connect(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server?.close());

  let nextId = 1;
  async function mcp(method: string, params?: unknown, headers: Record<string, string> = {}, bearer = token) {
    const res = await fetch(base + MCP_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bearer}`, ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) }),
    });
    return { status: res.status, headers: res.headers, body: res.status === 202 ? null : await res.json() as any };
  }
  const call = async (name: string, args: Record<string, unknown> = {}, bearer = token) =>
    (await mcp("tools/call", { name, arguments: args }, {}, bearer)).body.result;

  it("runs the agent loop: initialize, list tools, claim the most important task, note it, release it", async () => {
    const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    const notified = await fetch(base + MCP_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notified.status).toBe(202);
    expect(await notified.text()).toBe("");
    const tools = (await mcp("tools/list")).body.result.tools.map((t: any) => t.name);
    expect(tools).toContain("claim_next_task");

    expect((await call("whoami")).structuredContent.agent.name).toBe("Scout");

    const claimed = (await call("claim_next_task", { project_id: projectId })).structuredContent.task;
    expect(claimed.title).toBe("Urgent");
    const note = await call("add_task_note", { task_id: claimed.id, content: "Tried the migration; next: rerun", handoff: true });
    expect(note.isError).toBeUndefined();
    const released = await call("release_task", { task_id: claimed.id });
    expect(released.structuredContent.success).toBe(true);
    const task = (await call("get_task", { task_id: claimed.id })).structuredContent;
    expect(task.task.assignees ?? []).toEqual([]);
    expect(task.latestHandoffNote.content).toContain("next: rerun");
  });

  it("applies the token's own scopes - a read-only token cannot claim", async () => {
    const res = await call("claim_next_task", { project_id: projectId }, readOnlyToken);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/^permission_denied: /);
    expect((await call("list_tasks", { project_id: projectId, ready: true }, readOnlyToken)).isError).toBeUndefined();
  });

  it("reports an RPC's refusal in the server's words", async () => {
    const res = await call("get_task", { task_id: "tsk-does-not-exist" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not_found/);
  });

  it("refuses requests without a valid bearer token, from a foreign origin, or of the wrong shape", async () => {
    const plain = (init: RequestInit) => fetch(base + MCP_PATH, init);
    const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
    const noAuth = await plain({ method: "POST", headers: { "content-type": "application/json" }, body: ping });
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers.get("www-authenticate")).toBe('Bearer realm="tasker"');
    expect((await mcp("ping", undefined, {}, "tskr_not_a_real_token")).status).toBe(401);
    expect((await mcp("ping", undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await mcp("ping", undefined, { origin: "http://localhost:5173" })).status).toBe(200);
    expect((await mcp("ping", undefined, { "mcp-protocol-version": "1999-01-01" })).status).toBe(400);
    const get = await plain({ method: "GET", headers: { authorization: `Bearer ${token}` } });
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    const garbage = await plain({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{not json" });
    expect(garbage.status).toBe(400);
    expect(((await garbage.json()) as any).error.code).toBe(-32700);
    const huge = await plain({ method: "POST", headers: { authorization: `Bearer ${token}` }, body: "x".repeat(1024 * 1024 + 1) });
    expect(huge.status).toBe(413);
  });
});
