import { useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AttentionKind, AttentionScope } from './useAttention';

interface ReturnPosition { target: string; top: number; }
const positions = new WeakMap<QueryClient, Map<string, ReturnPosition>>();
export const attentionRowId = (kind: string, sourceId: string) => `attention-source-${encodeURIComponent(kind)}-${encodeURIComponent(sourceId)}`;

/** A task activation owns one return intent; background refresh never creates one. */
export function useAttentionReturn(scope: AttentionScope, kind: AttentionKind, ready: boolean, heading: RefObject<HTMLHeadingElement | null>) {
  const client = useQueryClient(), location = useLocation();
  let entries = positions.get(client);
  if (!entries) { entries = new Map(); positions.set(client, entries); }
  const stored = entries, key = JSON.stringify([scope.accountId, scope.orgId, scope.projectId, kind, location.key]);
  useEffect(() => {
    const position = stored.get(key);
    if (!ready || !position) return;
    stored.delete(key);
    const source = document.getElementById(position.target), target = source ?? heading.current;
    target?.focus({ preventScroll: true });
    const top = source ? position.top : Math.max(0, window.scrollY + (target?.getBoundingClientRect().top ?? 0) - window.innerHeight / 2);
    window.scrollTo({ top, behavior: 'instant' });
    if (target) {
      const rect = target.getBoundingClientRect(), header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      if (rect.top < header || rect.bottom > window.innerHeight) target.scrollIntoView?.({ block: 'center' });
    }
  }, [stored, key, ready, heading]);
  return (sourceId: string) => stored.set(key, { target: attentionRowId(kind, sourceId), top: window.scrollY });
}
