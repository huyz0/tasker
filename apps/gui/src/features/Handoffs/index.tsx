import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useNavigate } from 'react-router-dom';
import { transport } from '../../lib/connectTransport';
import { TaskNoteService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../../components/ui/ListState';
import { VirtualList } from '../../components/ui/VirtualList';
import { Handshake } from 'lucide-react';

const taskNoteClient = createClient(TaskNoteService, transport);

// --- Local shape ---------------------------------------------------------
//
// Narrower than the generated `HandoffNoteEntry` message, the same tradeoff
// every other feature file here makes (see e.g. Memory/index.tsx's `Belief`).

type HandoffEntry = {
  note: { id: string; taskId: string; agentId: string; content: string; createdAt: string; noteType: string };
  taskTitle: string;
  taskStatus: string;
};

const ROW_HEIGHT = 84;

/**
 * One task with a pending handoff note. Clicking navigates straight to the
 * task's detail view (`/tasks/:taskId`, which auto-opens on that route) -
 * this screen is a way *in*, not a place beliefs or notes get edited.
 */
function HandoffRow({ entry, onSelect }: { entry: HandoffEntry; onSelect: (taskId: string) => void }) {
  return (
    <button
      onClick={() => onSelect(entry.note.taskId)}
      className="flex w-full flex-col gap-1 border-b px-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{entry.taskTitle}</p>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
          {entry.taskStatus}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{entry.note.content}</p>
      <p className="text-xs text-muted-foreground">
        Agent {entry.note.agentId} · {new Date(entry.note.createdAt).toLocaleString()}
      </p>
    </button>
  );
}

/**
 * Top-level "which tasks currently have pending handoff context waiting" -
 * one row per task, the latest handoff note only (M22, ADR-0017). Structured
 * like Memory's own top-level screen (M21): project-scoped, its own nav
 * entry, its own route. Unlike Memory this is read-only - there is no create/
 * edit surface here, since handoff notes are agent-authored only and the
 * task detail view already covers browsing a single task's own notes.
 */
export function HandoffsScreen() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const navigate = useNavigate();

  const {
    data: pages, isLoading, error, refetch,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['handoffNotes', activeProjectId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => taskNoteClient.listHandoffNotes({
      projectId: activeProjectId!, page: { cursor: pageParam },
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page?.nextCursor || undefined,
    enabled: !!activeProjectId,
  });

  const entries = useMemo(() => (pages?.pages.flatMap((p) => p.entries) ?? []) as HandoffEntry[], [pages]);

  if (!activeOrgId) {
    return <p className="p-4 text-sm text-muted-foreground">Select an organization to see its pending handoffs.</p>;
  }
  if (!activeProjectId) {
    return <p className="p-4 text-sm text-muted-foreground">Select a project to see its pending handoffs.</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Handshake className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Handoffs</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Tasks with unfinished work an agent handed off - what it tried, what's blocked, and the next step.
      </p>

      <ListState
        isLoading={isLoading}
        error={error}
        isEmpty={!isLoading && !error && entries.length === 0}
        loadingMessage="Loading handoffs…"
        emptyMessage="No tasks currently have a pending handoff note."
        onRetry={() => refetch()}
      >
        <div className="rounded-md border">
          <VirtualList
            items={entries}
            rowHeight={ROW_HEIGHT}
            className="max-h-[70vh] overflow-y-auto"
            renderRow={(entry) => (
              <HandoffRow key={entry.note.id} entry={entry} onSelect={(taskId) => navigate(`/tasks/${taskId}`)} />
            )}
          />
          {hasNextPage && (
            <div className="border-t p-2 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more handoffs'}
              </button>
            </div>
          )}
        </div>
      </ListState>
    </div>
  );
}
