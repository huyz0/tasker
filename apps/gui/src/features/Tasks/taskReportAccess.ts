import { useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';

export interface TaskReportOwner { accountId: string; orgId: string; taskId: string; }
export type TaskReportSource = 'history' | 'notes' | 'usage' | 'artifacts';
interface SourceFence { epoch: number; denial?: Error; }
interface Fence {
  epoch: number; version: number; sequence: number; denial?: Error;
  sources: Map<TaskReportSource, SourceFence>; retries: Map<TaskReportSource, number>; listeners: Set<() => void>;
}
export interface TaskReportReadReceipt { taskEpoch: number; sourceEpoch: number; attempt?: number; }
const lifetimes = new WeakMap<QueryClient, Map<string, Fence>>();

function lifetime(client: QueryClient, scope: TaskReportOwner) {
  let owners = lifetimes.get(client);
  if (!owners) { owners = new Map(); lifetimes.set(client, owners); }
  const key = JSON.stringify([scope.accountId, scope.orgId, scope.taskId]);
  let fence = owners.get(key);
  if (!fence) {
    fence = { epoch: 0, version: 0, sequence: 0, sources: new Map(), retries: new Map(), listeners: new Set() };
    owners.set(key, fence);
  }
  return fence;
}

/** A known denial survives filter changes and remounts for this QueryClient owner. */
export function useTaskReportAccess(scope: TaskReportOwner, source: TaskReportSource) {
  const state = lifetime(useQueryClient(), scope);
  let local = state.sources.get(source);
  if (!local) { local = { epoch: 0 }; state.sources.set(source, local); }
  const owner = local;
  useSyncExternalStore(listener => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }, () => state.version);
  const publish = () => { state.version++; for (const listener of state.listeners) listener(); };
  const current = (receipt: TaskReportReadReceipt) => receipt.taskEpoch === state.epoch && receipt.sourceEpoch === owner.epoch;
  const allowed = () => !state.denial && !owner.denial;
  return {
    blocked: !allowed(), denial: state.denial ?? owner.denial, allowed, current,
    canRetry: source === 'history' || !state.denial,
    begin(): TaskReportReadReceipt {
      if (!allowed() && !state.retries.has(source)) throw state.denial ?? owner.denial;
      return { taskEpoch: state.epoch, sourceEpoch: owner.epoch, attempt: state.retries.get(source) };
    },
    failed(error: unknown, receipt: TaskReportReadReceipt) {
      if (!(error instanceof ConnectError) || !current(receipt)
        || ![Code.PermissionDenied, Code.Unauthenticated, Code.NotFound].includes(error.code)) return;
      if (source === 'history' || source === 'usage' || error.code === Code.Unauthenticated) {
        state.epoch++; state.denial = error; state.retries.clear();
      }
      else { owner.epoch++; owner.denial = error; state.retries.delete(source); }
      publish();
    },
    startRetry() { const attempt = ++state.sequence; state.retries.set(source, attempt); return attempt; },
    accept(receipt: TaskReportReadReceipt, attempt: number) {
      if (current(receipt) && receipt.attempt === attempt && state.retries.get(source) === attempt) {
        if (source === 'history') state.denial = undefined;
        owner.denial = undefined; publish();
      }
    },
    finishRetry(attempt: number) { if (state.retries.get(source) === attempt) state.retries.delete(source); },
  };
}
