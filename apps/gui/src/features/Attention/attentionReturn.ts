import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AttentionKind, AttentionScope } from './useAttention';

interface ReturnRead { fetching: boolean; observed: boolean; successful: boolean; unavailable: boolean; }
interface ReturnPosition { target: string; top: number; }
const positions = new WeakMap<QueryClient, Map<string, ReturnPosition>>();
export const attentionRowId = (kind: string, sourceId: string) => `attention-source-${encodeURIComponent(kind)}-${encodeURIComponent(sourceId)}`;

/** A task activation owns one return intent; background refresh never creates one. */
export function useAttentionReturn(scope: AttentionScope, kind: AttentionKind, read: ReturnRead, heading: RefObject<HTMLHeadingElement | null>) {
  const client = useQueryClient(), location = useLocation();
  let entries = positions.get(client);
  if (!entries) { entries = new Map(); positions.set(client, entries); }
  const stored = entries, key = JSON.stringify([scope.accountId, scope.orgId, scope.projectId, kind, location.key]);
  const cycle = useRef({ key, started: false });
  if (cycle.current.key !== key) cycle.current = { key, started: false };
  if (read.fetching) cycle.current.started = true;
  const settled = !read.fetching && (read.observed || read.unavailable || cycle.current.started);
  useEffect(() => {
    const position = stored.get(key);
    if (!position) return;
    if (!settled) {
      // New interaction supersedes a still-pending return, including a paused
      // network read. A later poll/reconnect must never revive that old intent.
      const cancel = () => { stored.delete(key); };
      const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin'];
      for (const event of events) window.addEventListener(event, cancel, { capture: true, passive: true });
      return () => { for (const event of events) window.removeEventListener(event, cancel, true); };
    }
    stored.delete(key);
    const source = read.successful && !read.unavailable ? document.getElementById(position.target) : null, target = source ?? heading.current;
    target?.focus({ preventScroll: true });
    const top = source ? position.top : Math.max(0, window.scrollY + (target?.getBoundingClientRect().top ?? 0) - window.innerHeight / 2);
    window.scrollTo({ top, behavior: 'instant' });
    if (target) {
      const rect = target.getBoundingClientRect(), header = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      if (rect.top < header || rect.bottom > window.innerHeight) target.scrollIntoView?.({ block: 'center' });
    }
  }, [stored, key, settled, read.successful, read.unavailable, heading]);
  return (sourceId: string) => stored.set(key, { target: attentionRowId(kind, sourceId), top: window.scrollY });
}
