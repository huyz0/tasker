import { Code, ConnectError, createContextValues } from '@connectrpc/connect';
import { and, eq, inArray, isNull, lte, not, or } from 'drizzle-orm';
import { z } from 'zod/v4';
import * as mysql from '../../db/schema.mysql';
import * as sqlite from '../../db/schema.sqlite';
import { transactionConflict } from '../../db/errors';
import { withUnitOfWork } from '../../db/access';
import { authorizePrincipal, getProjectOrgId } from '../../lib/authz';
import { parseScopes } from '../../lib/agentToken';
import { publishDomainEvent } from '../../lib/natsCorrelation';
import { runWithRequestContext } from '../../lib/requestContext';
import { logger } from '../../lib/logger';
import { currentPrincipalKey, currentUserIdKey, type Principal } from '../auth/session';
import { createTaskManagementHandler } from '../tasks/tasks.handler';
import { terminalStatusSql } from '../tasks/taskActivity';
import { createWorkflowOperations } from '../workflows/workflows.handler';

const ActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), userId: z.string().min(1).max(256) }),
  z.object({ kind: z.literal('agent'), agentId: z.string().min(1).max(256),
    orgId: z.string().min(1).max(256), tokenId: z.string().min(1).max(256) }),
]);
const InputsSchema = z.object({
  version: z.literal(1), projectId: z.string().min(1).max(256), orgId: z.string().min(1).max(256),
  title: z.string().min(1).max(512), description: z.string().max(4096),
  priority: z.number().int().min(0).max(4), skipIfOpen: z.boolean(), workflow: z.unknown().optional(),
});
const TERMINAL = new Set(['created', 'skipped', 'failed', 'cancelled']);
const BUSINESS_CODES = new Set([Code.InvalidArgument, Code.NotFound, Code.FailedPrecondition,
  Code.PermissionDenied, Code.Unauthenticated, Code.ResourceExhausted]);
type Lease = { id: string; token: string };

/** SQL owns creation; these leases identify who may enter that transaction. */
export function createScheduleExecutor(db: any, nc: any = null, clock: () => Date = () => new Date()) {
  const standalone = process.env.STANDALONE === 'true';
  const S = standalone ? sqlite : mysql;
  const runs = S.scheduleRuns as any, schedules = S.schedules as any, tasks = S.tasks as any;
  const taskHandler = createTaskManagementHandler(db, nc);
  const workflows = createWorkflowOperations(db, nc);

  async function authorizeActor(input: unknown, orgId: string): Promise<Principal> {
    const actor = ActorSchema.parse(input);
    let principal: Principal;
    if (actor.kind === 'user') principal = actor;
    else {
      const tokens = S.apiTokens as any, agents = S.agents as any;
      const [token] = await db.select({ id: tokens.id, agentId: tokens.agentId, orgId: tokens.orgId,
        scopes: tokens.scopes, expiresAt: tokens.expiresAt, revokedAt: tokens.revokedAt,
        liveAgentId: agents.id, agentOrgId: agents.orgId, agentDeletedAt: agents.deletedAt,
      }).from(tokens).leftJoin(agents, eq(tokens.agentId, agents.id)).where(eq(tokens.id, actor.tokenId)).limit(1);
      const expiresAt = token ? new Date(token.expiresAt).getTime() : Number.NaN;
      if (!token || token.agentId !== actor.agentId || token.orgId !== actor.orgId || actor.orgId !== orgId
        || token.liveAgentId !== actor.agentId || token.agentOrgId !== orgId || token.agentDeletedAt
        || token.revokedAt || !Number.isFinite(expiresAt) || expiresAt <= clock().getTime()) {
        throw new ConnectError('the original run credential is no longer valid', Code.Unauthenticated);
      }
      principal = { ...actor, scopes: parseScopes(token.scopes) };
    }
    await authorizePrincipal(db, principal, orgId, { scope: 'tasks:write', permission: 'task:write' });
    return principal;
  }

  /** No consistent snapshot before project→schedule→occurrence locking reads. */
  async function withLocks<T>(id: string, action: (row: any, schedule: any) => Promise<T>): Promise<T | null> {
    const [routing] = await db.select({ scheduleId: runs.scheduleId }).from(runs).where(eq(runs.id, id)).limit(1);
    if (!routing) return null;
    const [scope] = await db.select({ projectId: schedules.projectId }).from(schedules).where(eq(schedules.id, routing.scheduleId)).limit(1);
    if (!scope) return null;
    return withUnitOfWork(db, async () => {
      let projectQuery = db.select().from(S.projects).where(eq(S.projects.id, scope.projectId));
      if (!standalone) projectQuery = projectQuery.for('update');
      await projectQuery.limit(1);
      let scheduleQuery = db.select().from(schedules).where(eq(schedules.id, routing.scheduleId));
      if (!standalone) scheduleQuery = scheduleQuery.for('update');
      const [schedule] = await scheduleQuery.limit(1);
      if (!schedule) return null;
      let runQuery = db.select().from(runs).where(eq(runs.id, id));
      if (!standalone) runQuery = runQuery.for('update');
      const [row] = await runQuery.limit(1);
      if (!row) return null;
      let actor: { kind: 'user'; userId: string } | { kind: 'agent'; agentId: string } | undefined;
      try {
        const original = ActorSchema.parse(JSON.parse(row.actorJson));
        actor = original.kind === 'user' ? { kind: 'user', userId: original.userId } : { kind: 'agent', agentId: original.agentId };
      } catch { /* Invalid persisted actors fail validation before work creation. */ }
      return runWithRequestContext({ requestId: `schedule-${row.id}`, orgId: schedule.orgId,
        projectId: schedule.projectId, actor,
      }, () => action(row, schedule));
    });
  }

  function eligible(row: any, now: Date) {
    if (row.outcome === 'queued' || row.outcome === 'interrupted') {
      return !row.nextAttemptAt || new Date(row.nextAttemptAt).getTime() <= now.getTime();
    }
    return row.outcome === 'running' && (!row.claimedUntil || new Date(row.claimedUntil).getTime() <= now.getTime());
  }

  async function finish(row: any, schedule: any, outcome: string, taskId: string | null, detail: string | null) {
    const now = clock();
    const result = { ...row, outcome, taskId, detail, completedAt: now, frozenInputs: null,
      leaseToken: null, claimedUntil: null, nextAttemptAt: null };
    await db.update(runs).set({ outcome, taskId, detail, completedAt: now, frozenInputs: null,
      leaseToken: null, claimedUntil: null, nextAttemptAt: null,
    }).where(and(eq(runs.id, row.id), row.leaseToken ? eq(runs.leaseToken, row.leaseToken) : isNull(runs.leaseToken)));
    await db.update(schedules).set({ lastRunAt: now, lastOutcome: outcome, ...(taskId ? { lastTaskId: taskId } : {}) })
      .where(eq(schedules.id, schedule.id));
    publishDomainEvent(nc, 'domain.schedule.ran', { scheduleId: schedule.id, projectId: schedule.projectId,
      outcome, taskId, trigger: row.trigger });
    return result;
  }

  async function claim(id: string): Promise<Lease | null> {
    return withLocks(id, async (row, schedule) => {
      const now = clock();
      if (!eligible(row, now)) return null;
      if (schedule.deletedAt) { await finish(row, schedule, 'cancelled', null, 'The schedule was deleted before work creation committed.'); return null; }
      const token = crypto.randomUUID();
      await db.update(runs).set({ outcome: 'running', leaseToken: token, claimedUntil: new Date(now.getTime() + 60_000),
        attempts: Number(row.attempts ?? 0) + 1, startedAt: now, nextAttemptAt: null,
      }).where(and(eq(runs.id, row.id), eq(runs.outcome, row.outcome),
        row.leaseToken ? eq(runs.leaseToken, row.leaseToken) : isNull(runs.leaseToken)));
      publishDomainEvent(nc, 'domain.schedule.running', { scheduleId: schedule.id, projectId: schedule.projectId,
        outcome: 'running', trigger: row.trigger });
      return { id, token };
    });
  }

  function inputsOf(row: any, schedule: any) {
    if (!row.frozenInputs || Buffer.byteLength(row.frozenInputs, 'utf8') > 1_048_576) {
      throw new ConnectError('stored schedule inputs are invalid', Code.InvalidArgument);
    }
    let inputs: z.infer<typeof InputsSchema>;
    try { inputs = InputsSchema.parse(JSON.parse(row.frozenInputs)); }
    catch { throw new ConnectError('stored schedule inputs are invalid', Code.InvalidArgument); }
    if (!['task', 'workflow'].includes(row.targetKind)
      || inputs.orgId !== schedule.orgId || inputs.projectId !== schedule.projectId
      || Boolean(inputs.workflow) !== (row.targetKind === 'workflow')
      || (inputs.workflow && ((inputs.workflow as any).templateId !== row.targetId
        || (inputs.workflow as any).projectId !== inputs.projectId || (inputs.workflow as any).orgId !== inputs.orgId
        || (inputs.workflow as any).title !== inputs.title))) {
      throw new ConnectError('stored schedule scope is invalid', Code.InvalidArgument);
    }
    return inputs;
  }

  async function execute(lease: Lease) {
    try {
      return await withLocks(lease.id, async (row, schedule) => {
        if (TERMINAL.has(row.outcome) || row.leaseToken !== lease.token || row.outcome !== 'running') return row;
        if (schedule.deletedAt) return finish(row, schedule, 'cancelled', null, 'The schedule was deleted before work creation committed.');
        const inputs = inputsOf(row, schedule);
        const principal = await authorizeActor(JSON.parse(row.actorJson), schedule.orgId);
        if (await getProjectOrgId(db, inputs.projectId) !== inputs.orgId) throw new ConnectError('project not found', Code.NotFound);
        return runWithRequestContext({ requestId: `schedule-${row.id}-${row.attempts}`, orgId: schedule.orgId,
          projectId: schedule.projectId, actor: principal.kind === 'user' ? { kind: 'user', userId: principal.userId }
            : { kind: 'agent', agentId: principal.agentId },
        }, async () => {
          if (inputs.skipIfOpen && schedule.lastTaskId) {
            const [previous] = await db.select({ displayId: tasks.displayId }).from(tasks).where(and(eq(tasks.id, schedule.lastTaskId),
              eq(tasks.projectId, schedule.projectId), isNull(tasks.deletedAt), not(terminalStatusSql(tasks, standalone)))).limit(1);
            if (previous) return finish(row, schedule, 'skipped', null, `the previous run's task ${previous.displayId || schedule.lastTaskId} is still open`);
          }
          const values = createContextValues(); values.set(currentPrincipalKey, principal);
          values.set(currentUserIdKey, principal.kind === 'user' ? principal.userId : null);
          const ctx = { values } as any;
          const taskId = inputs.workflow
            ? (await workflows.instantiateFrozenWorkflow(inputs.workflow, ctx, row.id)).parent.id
            : (await taskHandler.createTask({ projectId: inputs.projectId, title: inputs.title, description: inputs.description,
              priority: inputs.priority, status: 'todo', idempotencyKey: `schedule:${row.id}` }, ctx)).task.id;
          await db.update(tasks).set({ scheduleId: schedule.id }).where(eq(tasks.id, taskId));
          return finish(row, schedule, 'created', taskId, null);
        });
      });
    } catch (error) {
      const business = error instanceof z.ZodError || error instanceof SyntaxError
        || (error instanceof ConnectError && BUSINESS_CODES.has(error.code));
      try {
        return await withLocks(lease.id, async (row, schedule) => {
          if (TERMINAL.has(row.outcome) || row.leaseToken !== lease.token || row.outcome !== 'running') return row;
          if (schedule.deletedAt) return finish(row, schedule, 'cancelled', null, 'The schedule was deleted before work creation committed.');
          if (business) return finish(row, schedule, 'failed', null,
            error instanceof ConnectError && [Code.Unauthenticated, Code.PermissionDenied].includes(error.code)
              ? 'The original run author or credential no longer has permission to create this work.'
              : 'The scheduled target is unavailable or its frozen inputs are invalid.');
          const nextAttemptAt = new Date(clock().getTime() + Math.min(300_000, 5000 * 2 ** Math.min(6, Number(row.attempts) - 1)));
          await db.update(runs).set({ outcome: 'interrupted', nextAttemptAt, leaseToken: null, claimedUntil: null,
            detail: 'Work creation was interrupted; recovery will retry this intent.',
          }).where(and(eq(runs.id, row.id), eq(runs.leaseToken, lease.token)));
          publishDomainEvent(nc, 'domain.schedule.interrupted', { scheduleId: schedule.id, projectId: schedule.projectId,
            outcome: 'interrupted', trigger: row.trigger });
          return { ...row, outcome: 'interrupted', nextAttemptAt, leaseToken: null, claimedUntil: null,
            detail: 'Work creation was interrupted; recovery will retry this intent.' };
        });
      } catch {
        logger.warn({ occurrenceId: lease.id, failure: 'occurrence_recovery_write_failed' }, 'schedule.recovery_failed');
        return null;
      }
    }
  }

  async function runPending(limit = 20) {
    const now = clock();
    let pending: Array<{ id: string }>;
    try {
      pending = await db.select({ id: runs.id }).from(runs).where(or(
      and(inArray(runs.outcome, ['queued', 'interrupted']), or(isNull(runs.nextAttemptAt), lte(runs.nextAttemptAt, now))),
      and(eq(runs.outcome, 'running'), or(isNull(runs.claimedUntil), lte(runs.claimedUntil, now))),
    )).orderBy(runs.ranAt, runs.id).limit(limit);
    } catch (error) {
      if (!transactionConflict(error)) throw error;
      logger.warn({ failure: 'occurrence_pending_scan_conflict' }, 'schedule.processing_deferred');
      return 0;
    }
    let processed = 0;
    for (const row of pending) {
      try { const lease = await claim(row.id); if (lease) { await execute(lease); processed++; } }
      catch { logger.warn({ occurrenceId: row.id, failure: 'occurrence_processing_failed' }, 'schedule.processing_failed'); }
    }
    return processed;
  }

  async function loadRun(id: string) {
    const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
    return row ?? null;
  }
  return { authorizeActor, claim, execute, runPending, loadRun };
}
