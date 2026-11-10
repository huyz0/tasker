import { useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import type { AttentionKind, AttentionScope } from './useAttention';

interface ProjectFence { epoch: number; denial?: Error; }
export interface AttentionReadReceipt { orgEpoch: number; projectEpoch: number; attempt?: number; }
interface OrganizationFence {
  epoch: number; version: number; sequence: number; denial?: Error;
  projects: Map<string, ProjectFence>; accepted: Map<string, AttentionReadReceipt>;
  retries: Map<string, number>; listeners: Set<() => void>;
}
// QueryClient lifetime, independent of the selected project, kind or mount.
const lifetimes = new WeakMap<QueryClient, Map<string, OrganizationFence>>();
function lifetime(client: QueryClient, scope: AttentionScope): OrganizationFence {
  let organizations = lifetimes.get(client);
  if (!organizations) { organizations = new Map(); lifetimes.set(client, organizations); }
  const key = JSON.stringify([scope.accountId, scope.orgId]);
  let state = organizations.get(key);
  if (!state) { state = { epoch: 0, version: 0, sequence: 0, projects: new Map(), accepted: new Map(), retries: new Map(), listeners: new Set() }; organizations.set(key, state); }
  return state;
}

/** Cached data is never evidence that a known-denied authority was restored. */
export function useAttentionAccess(scope: AttentionScope, kind: AttentionKind) {
  const state = lifetime(useQueryClient(), scope), key = JSON.stringify([scope.projectId, kind]);
  let project = state.projects.get(scope.projectId);
  if (!project) { project = { epoch: 0 }; state.projects.set(scope.projectId, project); }
  const owner = project;
  useSyncExternalStore(listener => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }, () => state.version);
  const publish = () => { state.version++; for (const listener of state.listeners) listener(); };
  const current = (receipt: AttentionReadReceipt) => receipt.orgEpoch === state.epoch && receipt.projectEpoch === owner.epoch;
  const allowed = () => (!state.denial && !owner.denial) || (!!state.accepted.get(key) && current(state.accepted.get(key)!));
  const denial = () => state.denial ?? owner.denial;
  return {
    blocked: !allowed(), denial: denial(), allowed, current,
    begin(): AttentionReadReceipt {
      if (!allowed() && !state.retries.has(key)) throw denial();
      return { orgEpoch: state.epoch, projectEpoch: owner.epoch, attempt: state.retries.get(key) };
    },
    failed(error: unknown, receipt: AttentionReadReceipt) {
      if (!(error instanceof ConnectError) || !current(receipt)) return;
      if (error.code === Code.PermissionDenied || error.code === Code.Unauthenticated) {
        state.epoch++; state.denial = error; state.accepted.clear(); state.retries.clear(); publish();
      } else if (error.code === Code.NotFound) {
        owner.epoch++; owner.denial = error;
        for (const candidate of state.retries.keys()) if (JSON.parse(candidate)[0] === scope.projectId) state.retries.delete(candidate);
        publish();
      }
    },
    startRetry() { const attempt = ++state.sequence; state.retries.set(key, attempt); return attempt; },
    accept(receipt: AttentionReadReceipt, attempt: number) {
      if (current(receipt) && receipt.attempt === attempt && state.retries.get(key) === attempt) {
        state.accepted.set(key, receipt); publish();
      }
    },
    finishRetry(attempt: number) { if (state.retries.get(key) === attempt) state.retries.delete(key); },
  };
}
