import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { transport } from '../../lib/connectTransport';
import { MemoryService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../../components/ui/ListState';
import { VirtualList } from '../../components/ui/VirtualList';
import { RowActionsMenu } from '../../components/ui/RowActionsMenu';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/button';
import { Search, Plus, History as HistoryIcon, Link2 } from 'lucide-react';

const memoryClient = createClient(MemoryService, transport);

// --- Local shapes -----------------------------------------------------
//
// Narrower than the generated `Belief`/`BeliefRelation`/`BeliefPromotion`
// messages, the same way `Teams/index.tsx`'s own `Team`/`TeamMember` types
// are - this file only ever reads these fields, and the generated types
// carry protobuf message internals nothing here needs.

type Belief = {
  id: string;
  orgId: string;
  scopeType: string;
  scopeId: string;
  statement: string;
  confidence: string;
  status: string;
  supersedesBeliefId?: string;
  sourceKind: string;
  sourceAgentId?: string;
  sourceUserId?: string;
  sourceTaskId?: string;
  sourceCommentId?: string;
  sourceTaskNoteId?: string;
  sourceArtifactId?: string;
  promotedFromScopeType?: string;
  promotedFromScopeId?: string;
  promotedBy?: string;
  promotedAt?: string;
  deletedAt?: string;
  createdAt: string;
};

type BeliefRelation = { id: string; beliefAId: string; beliefBId: string; relationType: string; createdBy: string; createdAt: string };
type BeliefPromotion = { id: string; beliefId: string; fromScopeType: string; fromScopeId: string; toScopeType: string; toScopeId: string; promotedBy: string; promotedAt: string; note?: string };

const BELIEF_ROW_HEIGHT = 92;
const RELATION_ROW_HEIGHT = 40;
const PROMOTION_ROW_HEIGHT = 56;

/** GUI-supported scope tiers. Team scope exists on the wire (ADR-0014) and
 * is fully reachable via the CLI/API, but recording or browsing at a
 * specific team isn't wired into this screen yet - picking a team would
 * need its own search-and-pick control (`Teams/index.tsx`'s `AddMemberPicker`
 * pattern, applied to teams instead of people), and no exit criterion for
 * this milestone requires it from the GUI specifically. */
const SCOPE_TYPES = ['project', 'organization'] as const;
type ScopeType = (typeof SCOPE_TYPES)[number];

const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const STATUSES = ['active', 'superseded', 'retracted'] as const;
const RELATION_TYPES = ['relates_to', 'supports', 'contradicts', 'duplicates'] as const;

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-success-subtle text-success-subtle-foreground',
  medium: 'bg-warning-subtle text-warning-subtle-foreground',
  low: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return null;
  const className = status === 'retracted' ? 'bg-destructive-subtle text-destructive-subtle-foreground' : 'bg-muted text-muted-foreground';
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${className}`}>{status}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${CONFIDENCE_BADGE[confidence] ?? 'bg-muted text-muted-foreground'}`}>
      {confidence} confidence
    </span>
  );
}

/**
 * "Recorded by an agent" / "Recorded by you", plus whichever source links
 * are present. Shows raw ids rather than resolving a task/comment/note/
 * artifact's title - the same tradeoff `Teams/index.tsx`'s own "ID: ..."
 * line makes, avoiding a second fetch per belief for a title this screen
 * does not otherwise need.
 */
function ProvenanceLine({ belief }: { belief: Belief }) {
  const parts: string[] = [belief.sourceKind === 'agent' ? 'Recorded by an agent' : 'Recorded by a person'];
  if (belief.sourceTaskId) parts.push(`from task ${belief.sourceTaskId}`);
  if (belief.sourceCommentId) parts.push(`comment ${belief.sourceCommentId}`);
  if (belief.sourceTaskNoteId) parts.push(`note ${belief.sourceTaskNoteId}`);
  if (belief.sourceArtifactId) parts.push(`artifact ${belief.sourceArtifactId}`);
  return <p className="text-xs text-muted-foreground truncate">{parts.join(' · ')}</p>;
}

/** One belief in the list. Statement is truncated to two lines - the full text is the detail panel's job. */
function BeliefCard({ belief, isSelected, onSelect }: { belief: Belief; isSelected: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(belief.id)}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex w-full flex-col gap-1 border-b px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${isSelected ? 'bg-primary-subtle' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium">{belief.statement}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <ConfidenceBadge confidence={belief.confidence} />
        <StatusBadge status={belief.status} />
      </div>
      <ProvenanceLine belief={belief} />
    </button>
  );
}

function RecordBeliefDialog({ open, onClose, orgId, scopeType, scopeId }: { open: boolean; onClose: () => void; orgId: string; scopeType: ScopeType; scopeId: string }) {
  const queryClient = useQueryClient();
  const [statement, setStatement] = useState('');
  const [confidence, setConfidence] = useState('medium');

  const mutation = useMutation({
    mutationFn: () => memoryClient.recordBelief({ orgId, scopeType, scopeId, statement: statement.trim(), confidence }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] });
      setStatement('');
      setConfidence('medium');
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="Record belief">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (statement.trim()) mutation.mutate(); }}>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-belief-statement" className="text-sm font-medium">Statement</label>
          <textarea
            id="new-belief-statement"
            autoFocus
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="e.g. This project always runs its migrations against MySQL in CI, not SQLite."
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-belief-confidence" className="text-sm font-medium">Confidence</label>
          <select
            id="new-belief-confidence"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          >
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">Failed to record belief: {(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!statement.trim() || mutation.isPending}>{mutation.isPending ? 'Recording…' : 'Record belief'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function SupersedeBeliefDialog({ open, onClose, belief, onSuperseded }: { open: boolean; onClose: () => void; belief: Belief; onSuperseded: (newId: string) => void }) {
  const queryClient = useQueryClient();
  const [statement, setStatement] = useState(belief.statement);
  const [confidence, setConfidence] = useState(belief.confidence);

  useEffect(() => {
    if (open) { setStatement(belief.statement); setConfidence(belief.confidence); }
  }, [open, belief.statement, belief.confidence]);

  const mutation = useMutation({
    mutationFn: () => memoryClient.supersedeBelief({ id: belief.id, statement: statement.trim(), confidence }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] });
      queryClient.invalidateQueries({ queryKey: ['memoryBelief', belief.id] });
      onClose();
      if (res.belief) onSuperseded(res.belief.id);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} title="Supersede belief">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (statement.trim()) mutation.mutate(); }}>
        <p className="text-sm text-muted-foreground">
          Records a new belief and marks this one superseded. The old statement stays visible in history; it stops appearing in default search results.
        </p>
        <div className="flex flex-col gap-1">
          <label htmlFor="supersede-statement" className="text-sm font-medium">New statement</label>
          <textarea
            id="supersede-statement"
            autoFocus
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="supersede-confidence" className="text-sm font-medium">Confidence</label>
          <select
            id="supersede-confidence"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          >
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">Failed to supersede: {(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!statement.trim() || mutation.isPending}>{mutation.isPending ? 'Superseding…' : 'Supersede'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Search-and-relate control, the same shape as `Teams/index.tsx`'s `AddMemberPicker`. */
function RelateBeliefPicker({ belief, existingRelatedIds, scopeType, scopeId }: { belief: Belief; existingRelatedIds: Set<string>; scopeType: ScopeType; scopeId: string }) {
  const queryClient = useQueryClient();
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const [relationType, setRelationType] = useState<string>('relates_to');

  const candidates = useQuery({
    queryKey: ['memoryBeliefs', 'search', scopeType, scopeId, debouncedSearch],
    enabled: isPicking && debouncedSearch.length > 0,
    queryFn: () => memoryClient.searchBeliefs({ scopeType, scopeId, query: debouncedSearch, limit: 10 }),
  });

  const relateMutation = useMutation({
    mutationFn: (beliefBId: string) => memoryClient.relateBeliefs({ beliefAId: belief.id, beliefBId, relationType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefRelations', belief.id] });
      setSearch('');
    },
  });

  const results = (candidates.data?.beliefs ?? []).filter((b) => b.id !== belief.id && !existingRelatedIds.has(b.id));

  if (!isPicking) {
    return (
      <button onClick={() => setIsPicking(true)} className="self-start text-sm text-primary hover:underline">
        <Link2 className="mr-1 inline h-3.5 w-3.5" /> Relate another belief
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-card p-2">
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium" htmlFor={`relate-search-${belief.id}`}>Search beliefs to relate</label>
          <input
            id={`relate-search-${belief.id}`}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Statement text"
            className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" htmlFor={`relate-type-${belief.id}`}>As</label>
          <select
            id={`relate-type-${belief.id}`}
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/50"
          >
            {RELATION_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      {candidates.isLoading && <span className="text-xs text-muted-foreground">Searching…</span>}
      {results.map((r) => (
        <button
          key={r.id}
          onClick={() => relateMutation.mutate(r.id)}
          disabled={relateMutation.isPending}
          className="truncate rounded px-1 py-0.5 text-left text-xs hover:bg-accent disabled:opacity-50"
        >
          {r.statement}
        </button>
      ))}
      {candidates.isSuccess && debouncedSearch && results.length === 0 && (
        <span className="text-xs text-muted-foreground">No matching beliefs.</span>
      )}
      {relateMutation.isError && <p role="alert" className="text-xs text-destructive">Failed to relate: {(relateMutation.error as Error).message}</p>}

      <button onClick={() => { setIsPicking(false); setSearch(''); }} className="mt-1 self-start text-xs text-muted-foreground">Done</button>
    </div>
  );
}

/**
 * The selected belief's full statement, provenance, related beliefs, and
 * a history tab of its promotions. Two tabs rather than `Teams/index.tsx`'s
 * always-visible sections, since "Related" and "History" answer different
 * questions ("what else is relevant" vs "how did this get here") and a
 * belief with a long promotion trail would otherwise push Related off
 * screen for no reason.
 */
function BeliefDetail({ belief, orgId, scopeType, onSelect }: { belief: Belief; orgId: string; scopeType: ScopeType; onSelect: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [tab, setTab] = useState<'related' | 'history'>('related');
  const [editing, setEditing] = useState(false);
  const [draftStatement, setDraftStatement] = useState(belief.statement);
  const [draftConfidence, setDraftConfidence] = useState(belief.confidence);
  const [supersedeOpen, setSupersedeOpen] = useState(false);

  useEffect(() => {
    setEditing(false);
    setDraftStatement(belief.statement);
    setDraftConfidence(belief.confidence);
  }, [belief.id, belief.statement, belief.confidence]);

  const updateMutation = useMutation({
    mutationFn: () => memoryClient.updateBelief({ id: belief.id, statement: draftStatement.trim(), confidence: draftConfidence }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] });
      queryClient.invalidateQueries({ queryKey: ['memoryBelief', belief.id] });
      setEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => memoryClient.archiveBelief({ id: belief.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] }),
  });
  const restoreMutation = useMutation({
    mutationFn: () => memoryClient.restoreBelief({ id: belief.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] }),
  });
  const purgeMutation = useMutation({
    mutationFn: () => memoryClient.purgeBelief({ id: belief.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] }),
  });

  const handleArchive = async () => {
    if (await confirm({
      title: 'Archive this belief?',
      consequence: 'It stops appearing in search and browse results.',
      undo: 'You can restore it from here at any time.',
      confirmLabel: 'Archive belief',
    })) archiveMutation.mutate();
  };
  const handlePurge = async () => {
    if (await confirm({
      title: 'Permanently delete this belief?',
      consequence: 'Its statement, relations, and promotion history are all removed.',
      undo: null,
      confirmLabel: 'Delete permanently',
    })) purgeMutation.mutate();
  };

  const {
    data: relations, isLoading: relationsLoading, error: relationsError, refetch: refetchRelations,
  } = useQuery({
    queryKey: ['memoryBeliefRelations', belief.id],
    queryFn: () => memoryClient.listBeliefRelations({ beliefId: belief.id }).then((r) => r.relations as BeliefRelation[]),
  });

  const unrelateMutation = useMutation({
    mutationFn: (relationId: string) => memoryClient.unrelateBeliefs({ relationId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memoryBeliefRelations', belief.id] }),
  });

  const {
    data: promotions, isLoading: promotionsLoading, error: promotionsError, refetch: refetchPromotions,
  } = useQuery({
    queryKey: ['memoryBeliefPromotions', belief.id],
    queryFn: () => memoryClient.listBeliefPromotions({ beliefId: belief.id }).then((r) => r.promotions as BeliefPromotion[]),
    enabled: tab === 'history',
  });

  const otherIdOf = (r: BeliefRelation) => (r.beliefAId === belief.id ? r.beliefBId : r.beliefAId);
  const existingRelatedIds = useMemo(() => new Set((relations ?? []).map(otherIdOf)), [relations]);

  const canPromote = belief.scopeType === 'project' && scopeType === 'project';
  const [promoteOpen, setPromoteOpen] = useState(false);

  return (
    <section aria-label="Belief detail" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ConfidenceBadge confidence={belief.confidence} />
            <StatusBadge status={belief.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {belief.scopeType} scope · ID: {belief.id}
            {belief.promotedFromScopeType && ` · promoted from ${belief.promotedFromScopeType}`}
          </p>
        </div>
        <RowActionsMenu
          label="Belief actions"
          actions={[
            { label: 'Supersede', onClick: () => setSupersedeOpen(true) },
            ...(canPromote ? [{ label: 'Promote', onClick: () => setPromoteOpen(true) }] : []),
            belief.deletedAt
              ? { label: 'Restore', onClick: () => restoreMutation.mutate() }
              : { label: 'Archive', destructive: true, onClick: handleArchive },
            ...(belief.deletedAt ? [{ label: 'Delete permanently', destructive: true, onClick: handlePurge }] : []),
          ]}
        />
      </div>

      {editing ? (
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (draftStatement.trim()) updateMutation.mutate(); }}>
          <label htmlFor={`edit-statement-${belief.id}`} className="text-sm font-medium">Statement</label>
          <textarea
            id={`edit-statement-${belief.id}`}
            autoFocus
            rows={4}
            value={draftStatement}
            onChange={(e) => setDraftStatement(e.target.value)}
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <select
            aria-label="Confidence"
            value={draftConfidence}
            onChange={(e) => setDraftConfidence(e.target.value)}
            className="w-40 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          >
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {updateMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to save: {(updateMutation.error as Error).message}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!draftStatement.trim() || updateMutation.isPending}>{updateMutation.isPending ? 'Saving…' : 'Save'}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="whitespace-pre-wrap text-sm">{belief.statement}</p>
          <button onClick={() => setEditing(true)} className="self-start text-xs text-primary hover:underline">Edit</button>
        </div>
      )}

      <ProvenanceLine belief={belief} />
      {archiveMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to archive: {(archiveMutation.error as Error).message}</p>}
      {restoreMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to restore: {(restoreMutation.error as Error).message}</p>}
      {purgeMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to delete: {(purgeMutation.error as Error).message}</p>}

      {/* Radix, not a hand-rolled tab pair - `design-system.md` §4 ("Do not
          hand-roll a second overlay, menu, or tab implementation"), the same
          reasoning `Organizations/index.tsx`'s own `Tabs.Root` comment
          records. `value`/`onValueChange` replace `tab`/`setTab` one-for-one. */}
      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as 'related' | 'history')}>
        <Tabs.List aria-label="Belief details" className="flex gap-1 border-b">
          <Tabs.Trigger
            value="related"
            className="px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            <Link2 className="mr-1 inline h-3.5 w-3.5" /> Related
          </Tabs.Trigger>
          <Tabs.Trigger
            value="history"
            className="px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground"
          >
            <HistoryIcon className="mr-1 inline h-3.5 w-3.5" /> History
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="related" className="flex flex-col gap-2 pt-2">
          <ListState
            isLoading={relationsLoading}
            error={relationsError}
            isEmpty={!relationsLoading && !relationsError && (relations ?? []).length === 0}
            loadingMessage="Loading related beliefs…"
            emptyMessage="No related beliefs yet."
            onRetry={() => refetchRelations()}
          >
            <div className="rounded-md border">
              <VirtualList
                items={relations ?? []}
                rowHeight={RELATION_ROW_HEIGHT}
                className="max-h-48 overflow-y-auto"
                renderRow={(relation) => (
                  <div key={relation.id} className="flex items-center gap-2 border-b px-3 text-sm">
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize">{relation.relationType.replace('_', ' ')}</span>
                    <button onClick={() => onSelect(otherIdOf(relation))} className="min-w-0 flex-1 truncate text-left text-primary hover:underline">
                      {otherIdOf(relation)}
                    </button>
                    <button
                      aria-label="Remove relation"
                      onClick={() => unrelateMutation.mutate(relation.id)}
                      disabled={unrelateMutation.isPending}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                )}
              />
            </div>
          </ListState>
          {unrelateMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to remove relation: {(unrelateMutation.error as Error).message}</p>}
          <RelateBeliefPicker belief={belief} existingRelatedIds={existingRelatedIds} scopeType={belief.scopeType as ScopeType} scopeId={belief.scopeId} />
        </Tabs.Content>

        <Tabs.Content value="history" className="pt-2">
          <ListState
            isLoading={promotionsLoading}
            error={promotionsError}
            isEmpty={!promotionsLoading && !promotionsError && (promotions ?? []).length === 0}
            loadingMessage="Loading history…"
            emptyMessage="Never promoted."
            onRetry={() => refetchPromotions()}
          >
            <div className="rounded-md border">
              <VirtualList
                items={promotions ?? []}
                rowHeight={PROMOTION_ROW_HEIGHT}
                className="max-h-48 overflow-y-auto"
                renderRow={(promotion) => (
                  <div key={promotion.id} className="flex flex-col gap-0.5 border-b px-3 py-1.5 text-sm">
                    <span>{promotion.fromScopeType} → {promotion.toScopeType}</span>
                    <span className="text-xs text-muted-foreground">
                      by {promotion.promotedBy} · {new Date(promotion.promotedAt).toLocaleString()}
                      {promotion.note && ` · ${promotion.note}`}
                    </span>
                  </div>
                )}
              />
            </div>
          </ListState>
        </Tabs.Content>
      </Tabs.Root>

      <SupersedeBeliefDialog open={supersedeOpen} onClose={() => setSupersedeOpen(false)} belief={belief} onSuperseded={onSelect} />
      {canPromote && (
        <PromoteBeliefDialog open={promoteOpen} onClose={() => setPromoteOpen(false)} belief={belief} orgId={orgId} />
      )}
      {confirmDialog}
    </section>
  );
}

/**
 * Promotion is consequential and has no reversal RPC - `undo: null` here is
 * literal, not a placeholder: nothing in `MemoryService` moves a belief back
 * to a narrower scope once promoted.
 */
function PromoteBeliefDialog({ open, onClose, belief, orgId }: { open: boolean; onClose: () => void; belief: Belief; orgId: string }) {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => memoryClient.promoteBelief({ id: belief.id, toScopeType: 'organization', toScopeId: orgId, note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefs'] });
      queryClient.invalidateQueries({ queryKey: ['memoryBelief', belief.id] });
      queryClient.invalidateQueries({ queryKey: ['memoryBeliefPromotions', belief.id] });
      setNote('');
      onClose();
    },
  });

  const handlePromote = async () => {
    if (await confirm({
      title: 'Promote this belief to organization scope?',
      consequence: 'It becomes visible to everyone with organization-level memory access, not just this project.',
      undo: null,
      confirmLabel: 'Promote',
    })) mutation.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Promote belief">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Moves this belief from project scope to organization scope. This cannot be undone.</p>
        <div className="flex flex-col gap-1">
          <label htmlFor="promote-note" className="text-sm font-medium">Note (optional)</label>
          <textarea
            id="promote-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this applies beyond the project"
            className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">Failed to promote: {(mutation.error as Error).message}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handlePromote} disabled={mutation.isPending}>{mutation.isPending ? 'Promoting…' : 'Promote'}</Button>
        </div>
      </div>
      {confirmDialog}
    </Dialog>
  );
}

export function MemoryExplorer() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const { beliefId: routeBeliefId } = useParams<{ beliefId?: string }>();
  const navigate = useNavigate();

  const [scopeType, setScopeType] = useState<ScopeType>('project');
  const [mode, setMode] = useState<'search' | 'browse'>('search');
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');
  const [selectedBeliefId, setSelectedBeliefId] = useState<string | null>(routeBeliefId ?? null);
  const [recordOpen, setRecordOpen] = useState(false);

  const scopeId = scopeType === 'project' ? activeProjectId : activeOrgId;

  // A direct link (`/memory/:beliefId`, following a link from a task or
  // comment, or opening a search result) resolves the belief on its own via
  // getBelief rather than requiring it to already be present in whatever
  // list/search page happens to be loaded.
  const directBeliefQuery = useQuery({
    queryKey: ['memoryBelief', routeBeliefId],
    queryFn: () => memoryClient.getBelief({ id: routeBeliefId! }).then((r) => r.belief as Belief),
    enabled: !!routeBeliefId,
  });

  useEffect(() => {
    if (routeBeliefId) setSelectedBeliefId(routeBeliefId);
  }, [routeBeliefId]);

  const searchQuery = useQuery({
    queryKey: ['memoryBeliefs', 'search', scopeType, scopeId, debouncedQuery, statusFilter, confidenceFilter],
    queryFn: () => memoryClient.searchBeliefs({
      scopeType, scopeId, query: debouncedQuery,
      status: statusFilter || undefined, confidence: confidenceFilter || undefined,
    }).then((r) => r.beliefs as Belief[]),
    enabled: mode === 'search' && !!scopeId && debouncedQuery.length > 0,
  });

  const {
    data: browsePages, isLoading: browseLoading, error: browseError, refetch: refetchBrowse,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['memoryBeliefs', 'list', scopeType, scopeId, statusFilter, confidenceFilter],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => memoryClient.listBeliefs({
      scopeType, scopeId, page: { cursor: pageParam },
      status: statusFilter || undefined, confidence: confidenceFilter || undefined,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: mode === 'browse' && !!scopeId,
  });
  const browseBeliefs = useMemo(() => (browsePages?.pages.flatMap((p) => p.beliefs) ?? []) as Belief[], [browsePages]);

  const beliefs = mode === 'search' ? (searchQuery.data ?? []) : browseBeliefs;
  const isLoading = mode === 'search' ? searchQuery.isLoading : browseLoading;
  const error = mode === 'search' ? searchQuery.error : browseError;
  const retry = mode === 'search' ? () => searchQuery.refetch() : () => refetchBrowse();

  const selectedBelief = beliefs.find((b) => b.id === selectedBeliefId) ?? (directBeliefQuery.data?.id === selectedBeliefId ? directBeliefQuery.data : undefined);

  const selectBelief = (id: string) => {
    setSelectedBeliefId(id);
    navigate(`/memory/${id}`, { replace: true });
  };

  if (!activeOrgId) {
    return <p className="p-4 text-sm text-muted-foreground">Select an organization to browse its shared memory.</p>;
  }
  if (scopeType === 'project' && !activeProjectId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a project to browse its shared memory, or switch to organization scope.</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:flex-row">
      <div className="flex w-full flex-col gap-3 md:w-96 md:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Memory</h1>
          <Button onClick={() => setRecordOpen(true)}><Plus className="mr-1 h-4 w-4" /> Record belief</Button>
        </div>

        <div className="flex items-center gap-1 text-xs">
          {SCOPE_TYPES.map((s) => (
            <button
              key={s}
              onClick={() => { setScopeType(s); setSelectedBeliefId(null); }}
              aria-pressed={scopeType === s}
              className={`rounded-full px-2.5 py-1 font-medium capitalize ${scopeType === s ? 'bg-primary-subtle text-primary-subtle-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {s}
            </button>
          ))}
          <span className="mx-1 text-muted-foreground">·</span>
          <button
            onClick={() => setMode(mode === 'search' ? 'browse' : 'search')}
            className="text-primary hover:underline"
          >
            {mode === 'search' ? 'Browse all' : 'Back to search'}
          </button>
        </div>

        {mode === 'search' && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search beliefs…"
              aria-label="Search beliefs"
              className="w-full rounded-md border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}

        <div className="flex gap-2 text-xs">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            aria-label="Filter by confidence"
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
            className="rounded-md border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Any confidence</option>
            {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <ListState
          isLoading={isLoading}
          error={error}
          isEmpty={!isLoading && !error && beliefs.length === 0}
          loadingMessage={mode === 'search' ? 'Searching…' : 'Loading beliefs…'}
          emptyMessage={mode === 'search' ? (debouncedQuery ? 'No beliefs match that search.' : 'Type to search this scope’s beliefs.') : 'No beliefs recorded yet.'}
          onRetry={retry}
        >
          <div className="rounded-md border">
            <VirtualList
              items={beliefs}
              rowHeight={BELIEF_ROW_HEIGHT}
              className="max-h-[60vh] overflow-y-auto"
              renderRow={(belief) => (
                <BeliefCard key={belief.id} belief={belief} isSelected={belief.id === selectedBeliefId} onSelect={selectBelief} />
              )}
            />
            {mode === 'browse' && hasNextPage && (
              <div className="border-t p-2 text-center">
                <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                  {isFetchingNextPage ? 'Loading…' : 'Load more beliefs'}
                </button>
              </div>
            )}
          </div>
        </ListState>
      </div>

      <div className="min-w-0 flex-1">
        {selectedBelief ? (
          <BeliefDetail belief={selectedBelief} orgId={activeOrgId} scopeType={scopeType} onSelect={selectBelief} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Select a belief to see its details, related beliefs, and history.</p>
        )}
      </div>

      <RecordBeliefDialog open={recordOpen} onClose={() => setRecordOpen(false)} orgId={activeOrgId} scopeType={scopeType} scopeId={scopeId} />
    </div>
  );
}
