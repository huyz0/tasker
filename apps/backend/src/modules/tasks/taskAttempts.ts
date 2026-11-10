import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as SQ from '../../db/schema.sqlite';
import * as MY from '../../db/schema.mysql';
import type { Principal } from '../auth/session';
import { ConnectError, Code } from '@connectrpc/connect';

const recordedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

/** Called only after the exact assignment insert wins, inside its unit of work. */
export async function createClaimReceipt(db: any, standalone: boolean, input: {
  id: string; taskId: string; orgId: string; principal: Principal; externalRunId?: string;
}) {
  const S = standalone ? SQ : MY;
  const { principal } = input;
  const ownerId = principal.kind === 'agent' ? principal.agentId : principal.userId;
  const owners = principal.kind === 'agent' ? S.agents : S.users;
  const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  const ownerName = owner?.name || (principal.kind === 'user' ? owner?.email : undefined) || ownerId;
  const row = {
    id: input.id, taskId: input.taskId, orgId: input.orgId,
    ownerKind: principal.kind, ownerId, ownerName, claimedAt: recordedNow(),
    externalRunId: input.externalRunId ?? null,
  };
  await db.insert(S.taskClaimAttempts).values(row);
  return {
    id: row.id, taskId: row.taskId, orgId: row.orgId,
    owner: { kind: row.ownerKind, id: row.ownerId, name: row.ownerName },
    claimedAt: row.claimedAt.toISOString(),
    ...(row.externalRunId !== null ? { externalRunId: row.externalRunId } : {}),
  };
}

/** IDs come from actual ownership removal in the same transaction; legacy rows have no receipt. */
export async function endClaimReceipts(db: any, standalone: boolean, ids: string[],
  reason: 'released' | 'unassigned' | 'owner_purged', actor: Principal | { kind: 'system' }) {
  if (!ids.length) return;
  const attempts = (standalone ? SQ : MY).taskClaimAttempts;
  await db.update(attempts).set({
    releasedAt: recordedNow(), releaseReason: reason, releasedByKind: actor.kind,
    releasedById: actor.kind === 'system' ? null : actor.kind === 'agent' ? actor.agentId : actor.userId,
  }).where(and(inArray(attempts.id, ids), isNull(attempts.releasedAt)));
}

type ReportAttemptScope = { taskId: string; orgId: string; principal: Principal; attemptId?: string };

async function reportReceiptId(db: any, standalone: boolean, input: ReportAttemptScope, legacyAssignment: boolean) {
  if (input.attemptId === undefined) return undefined;
  const attempts = (standalone ? SQ : MY).taskClaimAttempts;
  const [receipt] = await db.select({ id: attempts.id, taskId: attempts.taskId, orgId: attempts.orgId,
    ownerKind: attempts.ownerKind, ownerId: attempts.ownerId }).from(attempts).where(eq(attempts.id, input.attemptId)).limit(1);
  if (!receipt && legacyAssignment) return undefined;
  const ownerId = input.principal.kind === 'agent' ? input.principal.agentId : input.principal.userId;
  if (!receipt || receipt.taskId !== input.taskId || receipt.orgId !== input.orgId
    || receipt.ownerKind !== input.principal.kind || receipt.ownerId !== ownerId) {
    throw new ConnectError('claim receipt is not valid for this report', Code.NotFound);
  }
  return receipt.id as string;
}

/** Caller checks current operation access; closed receipts are valid for delayed reports. */
export const validatedReportAttemptId = (db: any, standalone: boolean, input: ReportAttemptScope) =>
  reportReceiptId(db, standalone, input, false);

/** Only a server-selected held assignment may use the pre-upgrade missing-receipt path. */
export const assignmentReceiptId = (db: any, standalone: boolean, input: ReportAttemptScope & { attemptId: string }) =>
  reportReceiptId(db, standalone, input, true);
