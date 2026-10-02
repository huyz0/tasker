/**
 * The MCP tool catalogue (M36-T02, ADR-0029): the agent loop, as tools.
 *
 * Every tool is a declared mapping from its arguments to exactly one existing
 * Connect RPC. Nothing here authorizes, filters or reshapes data: the RPC does
 * all of that, called over loopback with the caller's own credentials, so a
 * tool can never do more than the token could do directly.
 */
import {
  AuthService, ProjectService, TaskService, TaskTypeService, TaskNoteService, CommentService, MemoryService,
} from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { InvalidToolArguments, type ToolHost, type Tool, type ToolResult } from "./protocol";

type Args = Record<string, unknown>;
type Service = { typeName: string; methods: { name: string }[] };

interface ToolSpec extends Tool {
  service: Service;
  /** The RPC's wire name, e.g. "ClaimNextTask". */
  method: string;
  /** Validated arguments -> the RPC's JSON request. */
  request: (args: Args) => Args;
}

/** Calls one Connect RPC; resolves to its JSON response or rejects with a ConnectFailure. */
export type ConnectCaller = (service: Service, method: string, body: Args) => Promise<Args>;

/** A Connect error response - the server's code and words, passed to the model as they are. */
export class ConnectFailure extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
const PRIORITY_VALUE: Record<string, number> = { none: 0, urgent: 1, high: 2, medium: 3, low: 4 };

// --- schema helpers: the inputSchema each tool advertises *is* its validator ---
const str = (description: string, extra: Args = {}) => ({ type: "string", description, ...extra });
const bool = (description: string) => ({ type: "boolean", description });
const int = (description: string, minimum: number, maximum: number) => ({ type: "integer", description, minimum, maximum });
const strArray = (description: string) => ({ type: "array", items: { type: "string" }, description });
const priority = str("urgent, high, medium, low or none", { enum: PRIORITIES });
const limit = int("Page size", 1, 100);
const cursor = str("next_cursor from a previous page");

function schema(properties: Args, required: string[] = []): Tool["inputSchema"] {
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/**
 * Checks arguments against the tool's own inputSchema: required present, no
 * unknown keys, each value of its declared type and enum. A model that sends a
 * misspelt field is told so, rather than having it silently ignored.
 */
function validate(tool: Tool, args: Args): void {
  const props = tool.inputSchema.properties as Record<string, {
    type: string; enum?: readonly string[]; minimum?: number; maximum?: number;
    items?: { type: string; properties?: Record<string, { type: string; enum?: readonly string[] }>; required?: string[] };
  }>;
  for (const key of tool.inputSchema.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") throw new InvalidToolArguments(`${key} is required`);
  }
  for (const [key, value] of Object.entries(args)) {
    const p = props[key];
    if (!p) throw new InvalidToolArguments(`unknown argument "${key}" - expected one of: ${Object.keys(props).join(", ") || "(none)"}`);
    if (value === undefined || value === null) continue;
    const ok =
      p.type === "string" ? typeof value === "string" :
      p.type === "boolean" ? typeof value === "boolean" :
      p.type === "integer" ? Number.isInteger(value) && (p.minimum === undefined || (value as number) >= p.minimum) && (p.maximum === undefined || (value as number) <= p.maximum) :
      p.type === "array" && p.items?.type === "object" ? Array.isArray(value) && value.every((v) => objectMatches(v, p.items!)) :
      p.type === "array" ? Array.isArray(value) && value.every((v) => typeof v === "string") :
      false;
    if (!ok) {
      const shape = p.type === "integer" ? `an integer from ${p.minimum} to ${p.maximum}`
        : p.items?.type === "object" ? `an array of {${Object.entries(p.items.properties ?? {}).map(([k, v]) => `${k}: ${v.enum ? v.enum.join("|") : v.type}`).join(", ")}}`
        : `a ${p.type}`;
      throw new InvalidToolArguments(`${key} must be ${shape}`);
    }
    if (p.enum && !p.enum.includes(value as string)) throw new InvalidToolArguments(`${key} must be one of: ${p.enum.join(", ")}`);
  }
}

/** An array item against `{type: "object", properties, required}`: string fields only, enums honoured, nothing extra. */
function objectMatches(value: unknown, schema: { properties?: Record<string, { type: string; enum?: readonly string[] }>; required?: string[] }): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  const props = schema.properties ?? {};
  if ((schema.required ?? []).some((k) => obj[k] === undefined)) return false;
  return Object.entries(obj).every(([k, v]) => props[k] !== undefined && typeof v === "string" && (!props[k]!.enum || props[k]!.enum!.includes(v)));
}

/** Drops undefined values, so an absent argument is absent on the wire too. */
function defined(obj: Args): Args {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function page(args: Args) {
  const p = defined({ limit: args.limit, cursor: args.cursor, filter: args.query, sort: args.sort });
  return Object.keys(p).length ? { page: p } : {};
}

const readOnly = { readOnlyHint: true };

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "whoami", title: "Who am I",
    description: "The calling agent (or person): id, name, organization and token scopes. Call it first.",
    inputSchema: schema({}), annotations: readOnly,
    service: AuthService, method: "GetIdentity", request: () => ({}),
  },
  {
    name: "list_projects", title: "List projects",
    description: "Projects in an organization. An agent's organization is in whoami.",
    inputSchema: schema({ org_id: str("Organization id"), limit, cursor }, ["org_id"]), annotations: readOnly,
    service: ProjectService, method: "ListProjects", request: (a) => ({ orgId: a.org_id, ...page(a) }),
  },
  {
    name: "list_tasks", title: "List tasks",
    description: "Tasks in a project. ready=true gives exactly what claim_next_task chooses from; sort \"priority:asc\" puts urgent first.",
    inputSchema: schema({
      project_id: str("Project id"),
      ready: bool("Only open, unassigned tasks with nothing unfinished blocking them"),
      priority, label_id: str("Only tasks with this label"), parent_task_id: str("Only subtasks of this task"),
      status: str("Only this status"), assignee: str("\"unassigned\" or \"me\"", { enum: ["unassigned", "me"] }),
      query: str("Substring of the title"), sort: str("e.g. \"priority:asc\", \"createdAt:desc\", \"title\""), limit, cursor,
    }, ["project_id"]),
    annotations: readOnly,
    service: TaskService, method: "ListTasks",
    request: (a) => defined({
      projectId: a.project_id, ready: a.ready, priority: a.priority === undefined ? undefined : PRIORITY_VALUE[a.priority as string],
      labelId: a.label_id, parentTaskId: a.parent_task_id, status: a.status, assigneeFilter: a.assignee, ...page(a),
    }),
  },
  {
    name: "get_task", title: "Get a task",
    description: "One task with its description, assignees, blocked count and latest handoff note.",
    inputSchema: schema({ task_id: str("Task id") }, ["task_id"]), annotations: readOnly,
    service: TaskService, method: "GetTask", request: (a) => ({ taskId: a.task_id }),
  },
  {
    name: "create_task", title: "Create a task",
    description: "Creates a task. Record follow-up work you found with discovered_from_task_id, and prerequisites with blocked_by.",
    inputSchema: schema({
      project_id: str("Project id"), title: str("Title"), description: str("Markdown description"),
      status: str("Initial status (default: the type's first, or todo)"), task_type_id: str("Task type id"), priority,
      parent_task_id: str("Parent task in the same project"), blocked_by: strArray("Task ids that must finish first"),
      discovered_from_task_id: str("The task whose work turned this one up"),
      idempotency_key: str("Retry with the same key to get the original task back instead of a second one"),
    }, ["project_id", "title"]),
    service: TaskService, method: "CreateTask",
    request: (a) => defined({
      projectId: a.project_id, title: a.title, description: a.description ?? "", status: a.status ?? "",
      taskTypeId: a.task_type_id, priority: a.priority === undefined ? undefined : PRIORITY_VALUE[a.priority as string],
      parentTaskId: a.parent_task_id, blockedBy: a.blocked_by, discoveredFromTaskId: a.discovered_from_task_id,
      idempotencyKey: a.idempotency_key,
    }),
  },
  {
    name: "update_task", title: "Update a task",
    description: "Changes a task's title, description, priority or parent (parent_task_id \"\" clears it). Use set_task_status for status.",
    inputSchema: schema({
      task_id: str("Task id"), title: str("New title"), description: str("New Markdown description"), priority,
      parent_task_id: str("New parent, or \"\" to clear"),
    }, ["task_id"]),
    service: TaskService, method: "UpdateTask",
    request: (a) => defined({
      taskId: a.task_id, title: a.title, description: a.description,
      priority: a.priority === undefined ? undefined : PRIORITY_VALUE[a.priority as string], parentTaskId: a.parent_task_id,
    }),
  },
  {
    name: "set_task_status", title: "Set task status",
    description: "Moves a task to a status its type allows (see get_task_type). Finishing a task frees the tasks it blocked. " +
      "Some moves need a person's approval: then the result carries pendingApproval and the task has NOT moved yet - " +
      "follow it with get_transition_approval rather than assuming the move happened.",
    inputSchema: schema({ task_id: str("Task id"), status: str("New status") }, ["task_id", "status"]),
    service: TaskService, method: "UpdateTaskStatus", request: (a) => ({ taskId: a.task_id, status: a.status }),
  },
  {
    name: "claim_next_task", title: "Claim the next task",
    description: "Atomically claims the most important ready task in a project. No task in the result means there is no work.",
    inputSchema: schema({
      project_id: str("Project id"), task_type_id: str("Only this task type"), label_id: str("Only tasks with this label"),
      idempotency_key: str("Retry with the same key to get the original claim back"),
    }, ["project_id"]),
    service: TaskService, method: "ClaimNextTask",
    request: (a) => defined({ projectId: a.project_id, taskTypeId: a.task_type_id, labelId: a.label_id, idempotencyKey: a.idempotency_key }),
  },
  {
    name: "claim_task", title: "Claim a task",
    description: "Claims one named task, if nobody holds it.",
    inputSchema: schema({ task_id: str("Task id"), idempotency_key: str("Retry key") }, ["task_id"]),
    service: TaskService, method: "ClaimTask", request: (a) => defined({ taskId: a.task_id, idempotencyKey: a.idempotency_key }),
  },
  {
    name: "release_task", title: "Release a task",
    description: "Gives back a task you claimed, optionally recording a handoff note first (what you tried, what is blocked, the next step).",
    inputSchema: schema({ task_id: str("Task id"), handoff_note: str("Handoff note for the next claimant") }, ["task_id"]),
    service: TaskService, method: "ReleaseTask", request: (a) => defined({ taskId: a.task_id, handoffNote: a.handoff_note }),
  },
  {
    name: "list_my_tasks", title: "List my tasks",
    description: "Tasks you hold across every project of your organization.",
    inputSchema: schema({ org_id: str("Organization (people only; an agent's is implied)"), include_done: bool("Include finished tasks"), limit, cursor }),
    annotations: readOnly,
    service: TaskService, method: "ListMyTasks", request: (a) => defined({ orgId: a.org_id, includeTerminal: a.include_done, ...page(a) }),
  },
  {
    name: "add_task_note", title: "Add a task note",
    description: "Records an agent note on a task; handoff=true marks it as a handoff note the next claimant receives.",
    inputSchema: schema({ task_id: str("Task id"), content: str("Markdown"), handoff: bool("A handoff note") }, ["task_id", "content"]),
    service: TaskNoteService, method: "CreateTaskNote",
    request: (a) => ({ taskId: a.task_id, content: a.content, noteType: a.handoff ? "handoff" : "comment" }),
  },
  {
    name: "list_task_notes", title: "List task notes",
    description: "A task's agent notes and handoffs, newest first.",
    inputSchema: schema({ task_id: str("Task id"), limit, cursor }, ["task_id"]), annotations: readOnly,
    service: TaskNoteService, method: "ListTaskNotes", request: (a) => ({ taskId: a.task_id, ...page(a) }),
  },
  {
    name: "add_comment", title: "Comment on a task",
    description: "Adds a comment to a task's discussion - for the people watching it.",
    inputSchema: schema({ task_id: str("Task id"), content: str("Markdown") }, ["task_id", "content"]),
    service: CommentService, method: "CreateComment", request: (a) => ({ entityId: a.task_id, entityType: "task", content: a.content }),
  },
  {
    name: "link_tasks", title: "Link tasks",
    description: "kind \"blocked_by\": task_id cannot be claimed until linked_task_id finishes. kind \"discovered_from\": task_id was found while working linked_task_id.",
    inputSchema: schema({
      task_id: str("Task id"), linked_task_id: str("The other task"), kind: str("Relation", { enum: ["blocked_by", "discovered_from"] }),
    }, ["task_id", "linked_task_id", "kind"]),
    annotations: { idempotentHint: true },
    service: TaskService, method: "AddTaskLink", request: (a) => ({ taskId: a.task_id, linkedTaskId: a.linked_task_id, kind: a.kind }),
  },
  {
    name: "unlink_tasks", title: "Unlink tasks",
    description: "Removes a blocked_by or discovered_from link.",
    inputSchema: schema({
      task_id: str("Task id"), linked_task_id: str("The other task"), kind: str("Relation", { enum: ["blocked_by", "discovered_from"] }),
    }, ["task_id", "linked_task_id", "kind"]),
    annotations: { idempotentHint: true },
    service: TaskService, method: "RemoveTaskLink", request: (a) => ({ taskId: a.task_id, linkedTaskId: a.linked_task_id, kind: a.kind }),
  },
  {
    name: "list_task_links", title: "List a task's relations",
    description: "A task's parent, subtasks, blockers, dependents and where it was discovered.",
    inputSchema: schema({ task_id: str("Task id") }, ["task_id"]), annotations: readOnly,
    service: TaskService, method: "ListTaskLinks", request: (a) => ({ taskId: a.task_id }),
  },
  {
    name: "set_task_plan", title: "Set your plan for a task",
    description: "Replaces your plan for a task - send every step, every time; [] clears it. People watching the task see your progress.",
    inputSchema: schema({
      task_id: str("Task id"),
      steps: {
        type: "array",
        description: "Every step, in order",
        items: {
          type: "object",
          properties: { title: { type: "string" }, status: { type: "string", enum: ["pending", "in_progress", "done", "skipped"] } },
          required: ["title", "status"],
        },
      },
    }, ["task_id", "steps"]),
    annotations: { idempotentHint: true },
    service: TaskService, method: "SetTaskPlan", request: (a) => ({ taskId: a.task_id, steps: a.steps }),
  },
  {
    name: "request_input", title: "Ask a person",
    description: "Asks a person a question on a task when you need a decision you should not make yourself. The task's reviewers (or the org's admins) are notified. Check for the answer with get_input_request.",
    inputSchema: schema({ task_id: str("Task id"), question: str("What needs deciding, with the context a person needs"), options: strArray("Suggested answers (at most 10)") }, ["task_id", "question"]),
    service: TaskService, method: "RequestInput", request: (a) => defined({ taskId: a.task_id, question: a.question, options: a.options }),
  },
  {
    name: "get_input_request", title: "Get a question",
    description: "A question you asked: its status, and once answered, the answer.",
    inputSchema: schema({ input_request_id: str("Question id from request_input") }, ["input_request_id"]), annotations: readOnly,
    service: TaskService, method: "GetInputRequest", request: (a) => ({ id: a.input_request_id }),
  },
  {
    name: "list_input_requests", title: "List questions",
    description: "Questions on one task, or your organization's questions still waiting on people.",
    inputSchema: schema({ task_id: str("Only this task's questions"), status: str("Status", { enum: ["open", "answered", "cancelled", "all"] }), limit, cursor }),
    annotations: readOnly,
    service: TaskService, method: "ListInputRequests", request: (a) => defined({ taskId: a.task_id, status: a.status, ...page(a) }),
  },
  {
    name: "cancel_input_request", title: "Withdraw a question",
    description: "Withdraws a question you asked that no longer needs an answer.",
    inputSchema: schema({ input_request_id: str("Question id") }, ["input_request_id"]),
    service: TaskService, method: "CancelInputRequest", request: (a) => ({ id: a.input_request_id }),
  },
  {
    name: "get_transition_approval", title: "Get an approval request",
    description: "A status change of yours held for a person's approval: pending, approved (the move was applied), rejected (with a reason) or stale (the task moved meanwhile).",
    inputSchema: schema({ approval_id: str("Approval id from set_task_status's pendingApproval") }, ["approval_id"]), annotations: readOnly,
    service: TaskService, method: "GetTransitionApproval", request: (a) => ({ id: a.approval_id }),
  },
  {
    name: "list_transition_approvals", title: "List approval requests",
    description: "Status changes on one task, or your organization's, waiting on (or decided by) a person.",
    inputSchema: schema({ task_id: str("Only this task's approvals"), status: str("Status", { enum: ["pending", "approved", "rejected", "stale", "all"] }), limit, cursor }),
    annotations: readOnly,
    service: TaskService, method: "ListTransitionApprovals", request: (a) => defined({ taskId: a.task_id, status: a.status, ...page(a) }),
  },
  {
    name: "get_task_type", title: "Get a task type",
    description: "A task type's statuses and allowed transitions - which set_task_status moves are legal.",
    inputSchema: schema({ task_type_id: str("Task type id") }, ["task_type_id"]), annotations: readOnly,
    service: TaskTypeService, method: "GetTaskType", request: (a) => ({ id: a.task_type_id }),
  },
  {
    name: "search_memory", title: "Search shared memory",
    description: "Searches the beliefs (durable facts and conventions) recorded for an organization, team or project.",
    inputSchema: schema({
      scope_type: str("Scope", { enum: ["organization", "team", "project"] }), scope_id: str("Scope id"),
      query: str("What to look for"), limit: int("Maximum results", 1, 50),
    }, ["scope_type", "scope_id", "query"]),
    annotations: readOnly,
    service: MemoryService, method: "SearchBeliefs", request: (a) => defined({ scopeType: a.scope_type, scopeId: a.scope_id, query: a.query, limit: a.limit }),
  },
  {
    name: "record_belief", title: "Record a belief",
    description: "Records a durable fact or convention so the next agent need not rediscover it.",
    inputSchema: schema({
      org_id: str("Organization id"), scope_type: str("Scope", { enum: ["organization", "team", "project"] }), scope_id: str("Scope id"),
      statement: str("The fact, in one or two sentences"), confidence: str("How sure", { enum: ["low", "medium", "high"] }),
      source_task_id: str("The task where you learned it"),
    }, ["org_id", "scope_type", "scope_id", "statement"]),
    service: MemoryService, method: "RecordBelief",
    request: (a) => defined({ orgId: a.org_id, scopeType: a.scope_type, scopeId: a.scope_id, statement: a.statement, confidence: a.confidence, sourceTaskId: a.source_task_id }),
  },
];

/** The catalogue as `tools/list` shows it - the spec fields only. */
const TOOLS: Tool[] = TOOL_SPECS.map(({ service: _s, method: _m, request: _r, ...tool }) => tool);

/** A ToolHost whose every call is one RPC through `callRpc`. */
export function createToolHost(callRpc: ConnectCaller): ToolHost {
  return {
    tools: TOOLS,
    async call(name: string, args: Args): Promise<ToolResult> {
      const spec = TOOL_SPECS.find((t) => t.name === name)!;
      validate(spec, args);
      try {
        const response = await callRpc(spec.service, spec.method, spec.request(args));
        return { content: [{ type: "text", text: JSON.stringify(response) }], structuredContent: response };
      } catch (e) {
        // The RPC refused: the model reads the server's own words and can
        // correct itself - a protocol error would hide them.
        if (e instanceof ConnectFailure) return { content: [{ type: "text", text: `${e.code}: ${e.message}` }], isError: true };
        throw e;
      }
    },
  };
}

/**
 * A ConnectCaller that POSTs to a Connect listener with the caller's own
 * `Authorization` header (ADR-0029): the RPC authenticates, authorizes,
 * rate-limits and logs it exactly as if the agent had called it directly.
 */
export function loopbackCaller(baseUrl: string, authorization: string, fetchImpl: typeof fetch = fetch): ConnectCaller {
  return async (service, method, body) => {
    const res = await fetchImpl(`${baseUrl}/${service.typeName}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "connect-protocol-version": "1", authorization },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* a non-JSON body is reported below */ }
    if (!res.ok) throw new ConnectFailure(json.code ?? `http_${res.status}`, json.message ?? (text.slice(0, 200) || res.statusText));
    return json;
  };
}
