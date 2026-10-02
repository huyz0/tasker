import { describe, it, expect } from "bun:test";
import { TOOL_SPECS, createToolHost, loopbackCaller, ConnectFailure, type ConnectCaller } from "./tools";
import { InvalidToolArguments } from "./protocol";

/**
 * M36-T02 (ADR-0029). The catalogue is a set of mappings onto RPCs that
 * already exist; these tests fail when one points at an RPC, or a request
 * field, that does not.
 */

/** A plausible value for every advertised argument, so each mapping runs in full. */
function sampleArgs(tool: (typeof TOOL_SPECS)[number]) {
  const args: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(tool.inputSchema.properties) as [string, any][]) {
    args[key] = p.enum ? p.enum[0] : p.type === "boolean" ? true : p.type === "integer" ? p.minimum
      : p.type === "array" && p.items?.type === "object" ? [{ title: "x", status: "pending" }]
      : p.type === "array" ? ["x"] : "x";
  }
  return args;
}

describe("MCP tool catalogue (M36-T02)", () => {
  it("maps every tool onto an RPC that exists, sending only fields its request message has", () => {
    const names = new Set<string>();
    for (const tool of TOOL_SPECS) {
      expect(tool.name).toMatch(/^[a-z][a-z_]*$/);
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      const method = (tool.service as any).methods.find((m: any) => m.name === tool.method);
      expect(method, `${tool.name} -> ${tool.service.typeName}/${tool.method}`).toBeDefined();
      for (const req of tool.inputSchema.required ?? []) expect(tool.inputSchema.properties).toHaveProperty(req);

      const body = tool.request(sampleArgs(tool));
      const fields = new Map<string, any>(method.input.fields.map((f: any) => [f.jsonName, f]));
      for (const key of Object.keys(body)) {
        expect(fields.has(key), `${tool.name} sends ${key}, not a field of ${method.input.typeName}`).toBe(true);
        if (key === "page") {
          const pageFields = new Set(fields.get("page").message.fields.map((f: any) => f.jsonName));
          for (const k of Object.keys(body.page as object)) expect(pageFields.has(k), `${tool.name} page.${k}`).toBe(true);
        }
      }
    }
    // The agent loop, at least.
    for (const n of ["whoami", "claim_next_task", "set_task_status", "release_task", "create_task", "link_tasks", "search_memory",
      "set_task_plan", "request_input", "get_input_request", "get_transition_approval", "list_transition_approvals", "report_usage", "set_task_summary", "get_task_digest", "list_compaction_candidates", "list_workflow_templates", "get_workflow_template", "start_workflow", "list_schedules", "run_schedule"]) expect(names.has(n)).toBe(true);
    // Answering is a person's job (ADR-0031); no tool offers it.
    expect(names.has("answer_input_request")).toBe(false);
    expect(TOOL_SPECS.some((t) => t.method === "AnswerInputRequest")).toBe(false);
    // Nor deciding an approval (ADR-0032): an agent would approve its own move.
    expect(TOOL_SPECS.some((t) => t.method === "DecideTransitionApproval")).toBe(false);
    // Defining workflows is a person's job (ADR-0035); agents only start them.
    expect(TOOL_SPECS.some((t) => t.method === "CreateWorkflowTemplate" || t.method === "DeleteWorkflowTemplate")).toBe(false);
    // So is defining schedules (ADR-0036); agents may only run one now.
    expect(TOOL_SPECS.some((t) => ["CreateSchedule", "UpdateSchedule", "DeleteSchedule"].includes(t.method))).toBe(false);
  });

  it("validates arguments against the advertised schema", async () => {
    const host = createToolHost(async () => ({}));
    const refuse = (name: string, args: Record<string, unknown>, msg: RegExp) =>
      expect(host.call(name, args)).rejects.toThrow(msg);
    await refuse("claim_next_task", {}, /project_id is required/);
    await refuse("claim_next_task", { project_id: "" }, /project_id is required/);
    await refuse("claim_next_task", { project_id: "p", projectId: "p" }, /unknown argument "projectId"/);
    await refuse("list_tasks", { project_id: "p", ready: "yes" }, /ready must be a boolean/);
    await refuse("list_tasks", { project_id: "p", limit: 500 }, /limit must be an integer from 1 to 100/);
    await refuse("report_usage", { task_id: "t", cost_micros: 0.5 }, /cost_micros must be an integer/);
    await refuse("report_usage", { task_id: "t", input_tokens: -1 }, /input_tokens must be an integer/);
    await refuse("list_tasks", { project_id: "p", priority: "critical" }, /priority must be one of/);
    await refuse("create_task", { project_id: "p", title: "t", blocked_by: [1] }, /blocked_by must be a array/);
    await expect(host.call("whoami", { extra: 1 })).rejects.toBeInstanceOf(InvalidToolArguments);
    // Arrays of objects: shape, enum and no stray fields.
    const plan = (steps: unknown) => host.call("set_task_plan", { task_id: "t", steps });
    await expect(plan([{ title: "a", status: "done" }])).resolves.toBeDefined();
    for (const bad of [[{ title: "a" }], [{ title: "a", status: "blocked" }], [{ title: "a", status: "done", extra: "x" }], ["a"], [{ title: 1, status: "done" }]]) {
      await expect(plan(bad)).rejects.toThrow(/steps must be an array of \{title: string, status: pending\|in_progress\|done\|skipped\}/);
    }
  });

  it("sends the mapped request and returns the response as structured content", async () => {
    const sent: any[] = [];
    const caller: ConnectCaller = async (service, method, body) => {
      sent.push({ service: service.typeName, method, body });
      return { task: { id: "t1" } };
    };
    const host = createToolHost(caller);
    const res = await host.call("create_task", { project_id: "p", title: "Follow-up", priority: "urgent", blocked_by: ["a"], discovered_from_task_id: "o" });
    expect(sent).toEqual([{
      service: "tasker.health.v1.TaskService", method: "CreateTask",
      body: { projectId: "p", title: "Follow-up", description: "", status: "", priority: 1, blockedBy: ["a"], discoveredFromTaskId: "o" },
    }]);
    expect(res).toEqual({ content: [{ type: "text", text: '{"task":{"id":"t1"}}' }], structuredContent: { task: { id: "t1" } } });

    sent.length = 0;
    await host.call("list_tasks", { project_id: "p", ready: true, priority: "none", query: "db", limit: 5, sort: "priority:asc" });
    expect(sent[0].body).toEqual({ projectId: "p", ready: true, priority: 0, page: { limit: 5, filter: "db", sort: "priority:asc" } });
    sent.length = 0;
    await host.call("add_task_note", { task_id: "t", content: "c", handoff: true });
    expect(sent[0].body).toEqual({ taskId: "t", content: "c", noteType: "handoff" });
  });

  it("returns an RPC's refusal to the model as a tool error, in the server's words", async () => {
    const host = createToolHost(async () => { throw new ConnectFailure("permission_denied", "token lacks tasks:write"); });
    expect(await host.call("claim_next_task", { project_id: "p" })).toEqual({
      content: [{ type: "text", text: "permission_denied: token lacks tasks:write" }], isError: true,
    });
    const broken = createToolHost(async () => { throw new TypeError("socket hang up"); });
    await expect(broken.call("whoami", {})).rejects.toThrow("socket hang up");
  });
});

describe("loopbackCaller", () => {
  it("posts Connect JSON with the caller's own credentials and decodes errors", async () => {
    const seen: any[] = [];
    const fake = (async (url: string, init: any) => {
      seen.push({ url, init });
      if (url.endsWith("/Fail")) return new Response(JSON.stringify({ code: "not_found", message: "task not found" }), { status: 404 });
      if (url.endsWith("/Garbage")) return new Response("<html>bad gateway</html>", { status: 502, statusText: "Bad Gateway" });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const call = loopbackCaller("http://127.0.0.1:8080", "Bearer tk_x", fake);
    const svc = { typeName: "tasker.health.v1.TaskService", methods: [] };

    expect(await call(svc, "GetTask", { taskId: "t" })).toEqual({ ok: true });
    expect(seen[0].url).toBe("http://127.0.0.1:8080/tasker.health.v1.TaskService/GetTask");
    expect(seen[0].init.headers).toMatchObject({ authorization: "Bearer tk_x", "connect-protocol-version": "1", "content-type": "application/json" });
    expect(JSON.parse(seen[0].init.body)).toEqual({ taskId: "t" });

    await expect(call(svc, "Fail", {})).rejects.toMatchObject({ code: "not_found", message: "task not found" });
    await expect(call(svc, "Garbage", {})).rejects.toMatchObject({ code: "http_502", message: "<html>bad gateway</html>" });
  });
});
