/**
 * Workflow templates (M42, ADR-0035): a stored graph of steps, instantiated as
 * ordinary tasks - a parent plus one subtask per step, each `blocked_by` the
 * steps it depends on - so claim-next works through it in order.
 */
import { z } from "zod/v4";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { ConnectError, Code } from "@connectrpc/connect";
import * as schemaMysql from "../../db/schema.mysql";
import * as schemaSqlite from "../../db/schema.sqlite";
import { executePaginatedQuery } from "../../db/query-builder";
import { requirePrincipal, requireUser, getProjectOrgId, authorizePrincipal } from "../../lib/authz";
import { assertCan } from "../../lib/policy";
import { publishDomainEvent } from "../../lib/natsCorrelation";
import { withIdempotency } from "../../lib/idempotency";
import { purgeTaskCascade } from "../../lib/cascadePurge";
import { createTaskManagementHandler } from "../tasks/tasks.handler";

const MAX_STEPS = 50;
const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

const StepSchema = z.object({
  key: z.string().regex(KEY, "a step key is 1-64 lowercase letters, digits, '-' or '_', starting with a letter or digit"),
  title: z.string().trim().min(1, "every step needs a title").max(512),
  description: z.preprocess((v) => v ?? "", z.string().max(4096)),
  priority: z.preprocess((v) => v ?? 0, z.number().int().min(0, "priority is 0-4").max(4, "priority is 0-4")),
  taskTypeId: z.preprocess(blankToUndefined, z.string().optional()),
  status: z.preprocess(blankToUndefined, z.string().max(256).optional()),
  dependsOn: z.preprocess((v) => v ?? [], z.array(z.string())),
});
type Step = z.infer<typeof StepSchema>;

const StepsSchema = z.array(StepSchema)
  .min(1, "a workflow needs at least one step")
  .max(MAX_STEPS, `a workflow has at most ${MAX_STEPS} steps`);

const CreateSchema = z.object({
  orgId: z.string().min(1, "orgId is required"),
  projectId: z.preprocess(blankToUndefined, z.string().optional()),
  name: z.string().trim().min(1, "name is required").max(256),
  description: z.preprocess((v) => v ?? "", z.string().max(4096)),
  steps: StepsSchema,
});
const UpdateSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.string().trim().min(1, "name is required").max(256),
  description: z.preprocess((v) => v ?? "", z.string().max(4096)),
  steps: StepsSchema,
});
const IdSchema = z.object({ id: z.string().min(1, "id is required") });
const ListSchema = z.object({
  orgId: z.preprocess(blankToUndefined, z.string().optional()),
  projectId: z.preprocess(blankToUndefined, z.string().optional()),
  page: z.any().optional(),
});
const InstantiateSchema = z.object({
  templateId: z.string().min(1, "templateId is required"),
  projectId: z.string().min(1, "projectId is required"),
  title: z.preprocess(blankToUndefined, z.string().trim().min(1).max(512).optional()),
  idempotencyKey: z.preprocess(blankToUndefined, z.string().max(256).optional()),
});

/**
 * Steps in an order where every step comes after the steps it depends on.
 * Throws InvalidArgument naming the problem: a duplicate or unknown key, a
 * step depending on itself, or a cycle.
 */
export function orderSteps(steps: Step[]): Step[] {
  const byKey = new Map<string, Step>();
  for (const s of steps) {
    if (byKey.has(s.key)) throw new ConnectError(`step key "${s.key}" is used twice`, Code.InvalidArgument);
    byKey.set(s.key, s);
  }
  for (const s of steps) {
    for (const d of s.dependsOn) {
      if (d === s.key) throw new ConnectError(`step "${s.key}" depends on itself`, Code.InvalidArgument);
      if (!byKey.has(d)) throw new ConnectError(`step "${s.key}" depends on "${d}", which is not a step of this workflow`, Code.InvalidArgument);
    }
  }
  // Kahn's algorithm, keeping the author's order among steps that are ready
  // at the same time.
  const remaining = new Map(steps.map((s) => [s.key, new Set(s.dependsOn)]));
  const ordered: Step[] = [];
  while (remaining.size > 0) {
    const ready = steps.filter((s) => remaining.has(s.key) && remaining.get(s.key)!.size === 0);
    if (ready.length === 0) {
      throw new ConnectError(`the steps ${[...remaining.keys()].map((k) => `"${k}"`).join(", ")} depend on each other in a cycle`, Code.InvalidArgument);
    }
    for (const s of ready) {
      ordered.push(s);
      remaining.delete(s.key);
      for (const deps of remaining.values()) deps.delete(s.key);
    }
  }
  return ordered;
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : "");

export function createWorkflowsHandler(db: any, nc: any = null) {
  const isStandalone = process.env.STANDALONE === "true";
  const S = isStandalone ? schemaSqlite : schemaMysql;
  const templates = S.workflowTemplates as any;
  const taskTypes = S.taskTypes as any;
  const taskStatuses = S.taskStatuses as any;
  const tasks = createTaskManagementHandler(db, nc);

  /**
   * Every typed step's type must belong to the org; a given status must be
   * one of the type's (when it has any). Returns each type's first status, the
   * default for steps that name none.
   */
  async function checkTypes(orgId: string, steps: Step[]): Promise<Map<string, string>> {
    const typeIds = [...new Set(steps.map((s) => s.taskTypeId).filter(Boolean))] as string[];
    const firstStatus = new Map<string, string>();
    if (typeIds.length === 0) return firstStatus;
    const [types, statuses] = await Promise.all([
      db.select({ id: taskTypes.id, orgId: taskTypes.orgId }).from(taskTypes).where(inArray(taskTypes.id, typeIds)),
      db.select({ taskTypeId: taskStatuses.taskTypeId, name: taskStatuses.name, position: taskStatuses.position })
        .from(taskStatuses).where(inArray(taskStatuses.taskTypeId, typeIds)),
    ]);
    const typeOrg = new Map<string, string>(types.map((t: any) => [t.id, t.orgId]));
    const names = new Map<string, Set<string>>();
    for (const st of [...statuses].sort((a: any, b: any) => Number(a.position ?? 0) - Number(b.position ?? 0))) {
      if (!names.has(st.taskTypeId)) { names.set(st.taskTypeId, new Set()); firstStatus.set(st.taskTypeId, st.name); }
      names.get(st.taskTypeId)!.add(st.name);
    }
    for (const s of steps) {
      if (!s.taskTypeId) continue;
      if (typeOrg.get(s.taskTypeId) !== orgId) {
        throw new ConnectError(`step "${s.key}" names task type ${s.taskTypeId}, which is not a task type of this organization`, Code.InvalidArgument);
      }
      const allowed = names.get(s.taskTypeId);
      if (s.status && allowed && !allowed.has(s.status)) {
        throw new ConnectError(`step "${s.key}" has status "${s.status}", which its task type does not have (${[...allowed].join(", ")})`, Code.InvalidArgument);
      }
    }
    return firstStatus;
  }

  function toWire(row: any) {
    return {
      id: row.id,
      orgId: row.orgId,
      ...(row.projectId ? { projectId: row.projectId } : {}),
      name: row.name,
      description: row.description ?? "",
      steps: (typeof row.steps === "string" ? JSON.parse(row.steps) : row.steps).map((s: Step) => ({
        key: s.key,
        title: s.title,
        description: s.description ?? "",
        priority: s.priority ?? 0,
        ...(s.taskTypeId ? { taskTypeId: s.taskTypeId } : {}),
        ...(s.status ? { status: s.status } : {}),
        dependsOn: s.dependsOn ?? [],
      })),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  async function load(id: string) {
    const [row] = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
    if (!row) throw new ConnectError("workflow template not found", Code.NotFound);
    return row;
  }

  return {
    async createWorkflowTemplate(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = CreateSchema.parse(req);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: parsed.orgId }, "tasktype:write");
      if (parsed.projectId && (await getProjectOrgId(db, parsed.projectId)) !== parsed.orgId) {
        throw new ConnectError("project not found", Code.NotFound);
      }
      orderSteps(parsed.steps);
      await checkTypes(parsed.orgId, parsed.steps);
      const now = new Date();
      const row = {
        id: `wft-${crypto.randomUUID()}`, orgId: parsed.orgId, projectId: parsed.projectId ?? null, name: parsed.name,
        description: parsed.description, steps: JSON.stringify(parsed.steps), createdAt: now, updatedAt: now,
      };
      await db.insert(templates).values(row);
      publishDomainEvent(nc, "domain.workflow_template.created", { id: row.id, orgId: row.orgId, steps: parsed.steps.length });
      return { template: toWire(row) };
    },

    async updateWorkflowTemplate(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = UpdateSchema.parse(req);
      const row = await load(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
      orderSteps(parsed.steps);
      await checkTypes(row.orgId, parsed.steps);
      const changes = { name: parsed.name, description: parsed.description, steps: JSON.stringify(parsed.steps), updatedAt: new Date() };
      await db.update(templates).set(changes).where(eq(templates.id, row.id));
      publishDomainEvent(nc, "domain.workflow_template.updated", { id: row.id, orgId: row.orgId, steps: parsed.steps.length });
      return { template: toWire({ ...row, ...changes }) };
    },

    async getWorkflowTemplate(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = IdSchema.parse(req);
      const row = await load(parsed.id);
      await authorizePrincipal(db, principal, row.orgId, { scope: "tasks:read", permission: "tasktype:read" });
      return { template: toWire(row) };
    },

    async listWorkflowTemplates(req: unknown, { values }: { values: any }) {
      const principal = requirePrincipal(values);
      const parsed = ListSchema.parse(req);
      const projectOrg = parsed.projectId ? await getProjectOrgId(db, parsed.projectId) : undefined;
      if (projectOrg && parsed.orgId && projectOrg !== parsed.orgId) throw new ConnectError("project not found", Code.NotFound);
      const orgId = projectOrg ?? parsed.orgId ?? (principal.kind === "agent" ? principal.orgId : undefined);
      if (!orgId) throw new ConnectError("orgId or projectId is required", Code.InvalidArgument);
      await authorizePrincipal(db, principal, orgId, { scope: "tasks:read", permission: "tasktype:read" });
      // A project sees the org-wide templates and its own; an org, all of them.
      const scope = and(
        eq(templates.orgId, orgId),
        parsed.projectId ? or(isNull(templates.projectId), eq(templates.projectId, parsed.projectId)) : undefined,
      );
      const { items, nextCursor, totalCount } = await executePaginatedQuery(db, templates, scope, parsed.page, {
        filterColumn: templates.name,
        sortableColumns: { createdAt: templates.createdAt, name: templates.name },
        select: {
          id: templates.id, orgId: templates.orgId, projectId: templates.projectId, name: templates.name,
          description: templates.description, steps: templates.steps, createdAt: templates.createdAt, updatedAt: templates.updatedAt,
        },
        extraCacheKey: [orgId, parsed.projectId ?? ""].join("|"),
      });
      return { templates: items.map(toWire), page: { nextCursor, totalCount } };
    },

    async deleteWorkflowTemplate(req: unknown, { values }: { values: any }) {
      const userId = requireUser(values);
      const parsed = IdSchema.parse(req);
      const row = await load(parsed.id);
      await assertCan(db, { kind: "user", userId }, { type: "organization", id: row.orgId }, "tasktype:write");
      await db.delete(templates).where(eq(templates.id, row.id));
      publishDomainEvent(nc, "domain.workflow_template.deleted", { id: row.id, orgId: row.orgId });
      return { success: true };
    },

    /**
     * Parent first, then the steps in dependency order through CreateTask
     * itself. All or nothing: validated before anything is written, and a
     * create that still fails purges everything this call made (ADR-0035).
     */
    async instantiateWorkflow(req: unknown, ctx: { values: any }) {
      const principal = requirePrincipal(ctx.values);
      const parsed = InstantiateSchema.parse(req);
      const row = await load(parsed.templateId);
      const projectOrg = await getProjectOrgId(db, parsed.projectId);
      if (projectOrg !== row.orgId) throw new ConnectError("workflow template not found", Code.NotFound);
      await authorizePrincipal(db, principal, projectOrg, { scope: "tasks:write", permission: "task:write" });
      if (row.projectId && row.projectId !== parsed.projectId) {
        throw new ConnectError("this workflow template belongs to another project", Code.FailedPrecondition);
      }
      const steps = orderSteps(StepsSchema.parse(JSON.parse(row.steps)));
      const firstStatus = await checkTypes(row.orgId, steps);

      return withIdempotency(db, isStandalone, principal, "instantiateWorkflow", parsed.idempotencyKey, parsed, async () => {
        const created: string[] = [];
        try {
          const parent = (await tasks.createTask({
            projectId: parsed.projectId, title: parsed.title ?? row.name, status: "todo", description: row.description ?? "",
          }, ctx)).task;
          created.push(parent.id);
          const idByKey = new Map<string, string>();
          const byKey = new Map<string, any>();
          for (const s of steps) {
            const task = (await tasks.createTask({
              projectId: parsed.projectId,
              title: s.title,
              description: s.description,
              priority: s.priority,
              ...(s.taskTypeId ? { taskTypeId: s.taskTypeId, status: s.status ?? firstStatus.get(s.taskTypeId) ?? "todo" } : { status: s.status ?? "todo" }),
              parentTaskId: parent.id,
              blockedBy: s.dependsOn.map((k) => idByKey.get(k)!),
            }, ctx)).task;
            created.push(task.id);
            idByKey.set(s.key, task.id);
            byKey.set(s.key, task);
          }
          publishDomainEvent(nc, "domain.task.workflow_started", {
            taskId: parent.id, projectId: parsed.projectId, templateId: row.id, steps: steps.length,
          });
          // Steps come back in the template's own order, not creation order.
          const authorOrder = (JSON.parse(row.steps) as Step[]).map((s) => byKey.get(s.key));
          return { parent, steps: authorOrder };
        } catch (e) {
          for (const id of created.reverse()) {
            await purgeTaskCascade(db, id).catch(() => undefined);
          }
          throw e;
        }
      });
    },
  };
}
