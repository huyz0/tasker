import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import type { Interceptor } from "@connectrpc/connect";
import { AuthService, TaskService, TaskNoteService, WorkflowService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { setupIntegrationTest, makeAuthContext, seedOrgWithAdmin, seedProject } from "../../test/setup";
import * as schemaSqlite from "../../db/schema.sqlite";
import { currentPrincipalKey, currentUserIdKey } from "../auth/session";
import { resolvePrincipal } from "../../lib/authenticate";
import { validationErrorInterceptor } from "../../lib/validationErrors";
import { createAuthHandler } from "../auth/auth.handler";
import { createTaskManagementHandler, createTasksHandler } from "../tasks/tasks.handler";
import { createTaskNotesHandler } from "../tasks/task_notes.handler";
import { createAgentsHandler } from "../agents/agents.handler";
import { handleMcpHttp, MCP_PATH } from "./http";
import { createWorkflowsHandler } from "../workflows/workflows.handler";

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
  let gatedTaskId = "";
  let workflowId = "";
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
    // M39: a type whose todo -> done needs a person's approval when an agent moves it.
    const types = createTasksHandler(db, setup.nc);
    const typeId = (await types.createTaskType({ orgId, projectId, name: "Release" }, admin)).taskType.id;
    const todo = (await types.createTaskStatus({ taskTypeId: typeId, name: "todo" }, admin)).status.id;
    const done = (await types.createTaskStatus({ taskTypeId: typeId, name: "done" }, admin)).status.id;
    const edge = (await types.createTaskStatusTransition({ taskTypeId: typeId, fromStatusId: todo, toStatusId: done }, admin)).transition.id;
    await types.setTransitionApproval({ taskTypeId: typeId, transitionId: edge, requiresApproval: true }, admin);
    workflowId = (await createWorkflowsHandler(db, setup.nc).createWorkflowTemplate({
      orgId, name: "Hotfix", steps: [{ key: "fix", title: "Fix" }, { key: "verify", title: "Verify", dependsOn: ["fix"] }],
    }, admin)).template.id;
    gatedTaskId = (await tasks.createTask({ projectId, title: "Ship 2.0", status: "todo", taskTypeId: typeId, priority: 4 }, admin)).task.id;

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
        router.service(WorkflowService as any, createWorkflowsHandler(db, setup.nc));
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

  it("a gated move comes back pending, unmoved, and can be followed (M39)", async () => {
    const res = await call("set_task_status", { task_id: gatedTaskId, status: "done" });
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent.task.status).toBe("todo");
    const pending = res.structuredContent.pendingApproval;
    expect(pending).toMatchObject({ status: "pending", fromStatus: "todo", toStatus: "done", requestedByName: "Scout" });
    expect((await call("get_transition_approval", { approval_id: pending.id })).structuredContent.approval.status).toBe("pending");
    const listed = (await call("list_transition_approvals", { task_id: gatedTaskId })).structuredContent.approvals;
    expect(listed.map((a: any) => a.id)).toEqual([pending.id]);
  });

  it("reports usage and reads the task's totals back (M40)", async () => {
    const first = await call("report_usage", { task_id: gatedTaskId, model_name: "m-1", input_tokens: 1200, output_tokens: 300, cost_micros: 15000, idempotency_key: "k1" });
    expect(first.isError).toBeUndefined();
    expect(first.structuredContent).toMatchObject({ record: { modelName: "m-1", costMicros: "15000", reportedByName: "Scout" } });
    expect(first.structuredContent.replayed).toBeUndefined();
    expect((await call("report_usage", { task_id: gatedTaskId, cost_micros: 15000, idempotency_key: "k1" })).structuredContent.replayed).toBe(true);
    const usage = (await call("get_task", { task_id: gatedTaskId })).structuredContent.task.usage;
    expect(usage).toEqual({ inputTokens: "1200", outputTokens: "300", costMicros: "15000", reports: "1" });
    const empty = await call("report_usage", { task_id: gatedTaskId });
    expect(empty.isError).toBe(true);
    expect(empty.content[0].text).toMatch(/tokens or cost/);
  });

  it("summarizes a task and reads it back as a digest (M41)", async () => {
    const set = await call("set_task_summary", { task_id: gatedTaskId, text: "Shipped 2.0 behind a flag." });
    expect(set.structuredContent.summary).toMatchObject({ text: "Shipped 2.0 behind a flag.", authorName: "Scout" });
    const digest = (await call("get_task_digest", { task_id: gatedTaskId })).structuredContent.digest;
    expect(digest.task.summary.text).toBe("Shipped 2.0 behind a flag.");
    expect(digest.relations).toBeDefined();
    const candidates = await call("list_compaction_candidates", { project_id: projectId, older_than_days: 0 });
    expect(candidates.isError).toBeUndefined();
    expect(candidates.structuredContent.candidates ?? []).not.toContainEqual(expect.objectContaining({ taskId: gatedTaskId }));
  });

  it("lists, reads and starts a workflow (M42)", async () => {
    const listed = (await call("list_workflow_templates", { project_id: projectId })).structuredContent.templates;
    expect(listed.map((t: any) => t.name)).toContain("Hotfix");
    expect((await call("get_workflow_template", { template_id: workflowId })).structuredContent.template.steps).toHaveLength(2);
    const started = (await call("start_workflow", { template_id: workflowId, project_id: projectId, title: "Hotfix 1" })).structuredContent;
    expect(started.parent.title).toBe("Hotfix 1");
    expect(started.steps.map((s: any) => s.title)).toEqual(["Fix", "Verify"]);
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
