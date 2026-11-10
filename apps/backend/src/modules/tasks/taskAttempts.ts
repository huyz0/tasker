import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as SQ from '../../db/schema.sqlite';
import * as MY from '../../db/schema.mysql';
import type { Principal } from '../auth/session';

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
