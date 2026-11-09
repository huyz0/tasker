import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Search, CheckSquare, FileBox, FolderKanban, Bot, MessageSquare, Brain, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { useLayoutStore } from '../../store/layout';
import { Dialog } from '../ui/Dialog';
import { ListState } from '../ui/ListState';

const searchClient = createClient(SearchService, transport);

// The result types the backend's universalSearch emits, each mapped to the
// route that actually renders that entity. Keeping the mapping in one place is
// what lets a test prove every rendered result has somewhere to go: a result
// with no route here is never rendered, so no click is ever dead.
const ROUTE_BY_RESULT_TYPE: Record<string, (id: string) => string> = {
  task: (id) => `/tasks/${id}`,
  artifact: (id) => `/artifacts/${id}`,
  belief: (id) => `/memory/${id}`,
  // Neither projects nor agents have a detail screen, so both land on their
  // list. Routing a project to `/projects/<id>` would have matched no route and
  // dropped the user on Not Found — a dead link that looks like a working one.
  project: () => '/projects',
  agent: () => '/agents',
};

/**
 * A comment has no screen of its own, so it routes to the task or artifact it
 * hangs off — which the backend supplies as `parentType`/`parentId` precisely
 * because the comment's own id leads nowhere.
 */
export function resultRoute(result: { type: string; id: string; parentType?: string; parentId?: string }): string | null {
  if (result.type === 'comment') {
    if (!result.parentType || !result.parentId) return null;
    return ROUTE_BY_RESULT_TYPE[result.parentType]?.(result.parentId) ?? null;
  }
  return ROUTE_BY_RESULT_TYPE[result.type]?.(result.id) ?? null;
}

/**
 * Renders a snippet with the query's words marked.
 *
 * Takes offsets rather than markup on purpose: the server sends plain text and
 * ranges, so nothing here has to trust server-supplied HTML. `<mark>` is the
 * element that already means "relevant to the user's current activity", so
 * screen readers get the emphasis too rather than a styled span.
 */
export function HighlightedSnippet({ text, matches }: {
  text: string;
  matches: readonly { start: number; length: number }[];
}) {
  if (matches.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    // Ignore a range that does not address this string. The server computes
    // these against the snippet it sends, but a client that renders whatever
    // it is handed will happily slice past the end and drop the rest.
    if (m.start < cursor || m.start + m.length > text.length) return;
    if (m.start > cursor) parts.push(text.slice(cursor, m.start));
    parts.push(<mark key={i} className="bg-warning-subtle text-warning-subtle-foreground rounded-sm">{text.slice(m.start, m.start + m.length)}</mark>);
    cursor = m.start + m.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

const ICON_BY_RESULT_TYPE: Record<string, typeof CheckSquare> = {
  task: CheckSquare,
  artifact: FileBox,
  project: FolderKanban,
  agent: Bot,
  comment: MessageSquare,
  belief: Brain,
};

/** Section order and heading, so six entity types read as a scan, not a jumble. */
const TYPE_LABEL: Record<string, string> = {
  task: 'Tasks',
  artifact: 'Artifacts',
  project: 'Projects',
  agent: 'Agents',
  comment: 'Comments',
  belief: 'Memory',
};
const TYPE_ORDER = ['task', 'artifact', 'project', 'agent', 'comment', 'belief'];

/**
 * The button that opens the palette. Rendered twice — once in the header for
 * desktop, once in the sidebar for mobile — which is exactly why the palette
 * itself is not rendered here: it used to be, and each copy kept its own `open`
 * state and its own ⌘K listener, so the shortcut opened two stacked modal
 * dialogs (M06-T03).
 */
/**
 * `compact` renders the trigger as an icon-only button.
 *
 * The mobile header (AppShell) has ~214px for the search trigger, the theme
 * toggle and the avatar combined; the labelled trigger alone measures 161px,
 * which pushed every route's document to 420px wide at a 375px viewport — the
 * whole page scrolled sideways. The label is kept in the accessible tree via
 * `sr-only` rather than dropped, so the button keeps its name without an
 * `aria-label` that could drift from the visible text on the wide variant.
 */
export function GlobalSearchTrigger({ compact = false }: { compact?: boolean }) {
  const toggleSearch = useLayoutStore((s) => s.toggleSearch);
  return (
    <button
      onClick={toggleSearch}
      className={`flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 hover:bg-muted/80 rounded-md border border-border transition-colors min-w-0 ${
        compact ? 'p-2 shrink-0' : 'px-3 py-1.5 w-full justify-between'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
        {/* One line, always: at the sidebar's width this wrapped onto two
            centred lines, which made the trigger read as a paragraph. */}
        <span className={compact ? 'sr-only' : 'truncate'}>Search tasks, artifacts…</span>
      </span>
      {!compact && (
        <kbd className="hidden md:inline-flex shrink-0 h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-2xs font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      )}
    </button>
  );
}

/** The palette itself. Mounted **once**, by `AppShell`. */
export function GlobalSearch() {
  const isOpen = useLayoutStore((s) => s.searchOpen);
  const setIsOpen = useLayoutStore((s) => s.setSearchOpen);
  const toggleSearch = useLayoutStore((s) => s.toggleSearch);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim();
  const [debouncedQuery] = useDebounce(normalizedQuery, 300);
  const navigate = useNavigate();
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const waitingForQuery = normalizedQuery !== debouncedQuery;
  const currentQuery = !!activeOrgId && !!normalizedQuery && !waitingForQuery && isOpen;
  // The result the keyboard (or a mouse hover, which shares this state rather
  // than owning a separate `:hover` treatment) currently points at. Reset
  // whenever the result set changes — carrying an old index into a shorter
  // list highlighted nothing, or the wrong row.
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
      // Escape is `Dialog`'s job while the palette is open; this only matters
      // for the closed case, where there is nothing to close.
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  const { data: responseData, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['universalSearch', debouncedQuery, activeOrgId],
    queryFn: async ({ signal }) => {
      // The same current-query predicate gates the request and its results.
      const resp = await searchClient.universalSearch({ query: debouncedQuery, orgId: activeOrgId }, { signal });
      // Drop anything this build has no route for rather than offering the
      // user a result that does nothing when clicked.
      return resp.results.filter((r) => resultRoute(r) !== null);
    },
    enabled: currentQuery,
    // Interactive search exposes failures immediately and retries on request.
    retry: false,
  });

  const isLoading = !!activeOrgId && !!normalizedQuery && (waitingForQuery || isPending || isFetching);
  const currentError = currentQuery ? error : null;
  // One ordered result sequence drives display, aria selection and Enter.
  // While input/debounce/authority changes, old rows cannot capture a keypress.
  const data = useMemo(() => currentQuery && !isLoading && !currentError && responseData
    ? TYPE_ORDER.flatMap(type => responseData.filter(result => result.type === type)) : undefined,
  [currentQuery, isLoading, currentError, responseData]);
  const activeIndex = Math.min(highlighted, Math.max(0, (data?.length ?? 1) - 1));
  useEffect(() => setHighlighted(0), [data]);
  useEffect(() => {
    if (!data?.length) return;
    resultsRef.current?.querySelector<HTMLElement>(`#search-result-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, data]);

  // Group the ordered sequence without changing its keyboard indices.
  const groups = useMemo(() => {
    if (!data) return [];
    const byType = new Map<string, { result: NonNullable<typeof data>[number]; flatIndex: number }[]>();
    data.forEach((result, flatIndex) => {
      const list = byType.get(result.type) ?? [];
      list.push({ result, flatIndex });
      byType.set(result.type, list);
    });
    return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({ type, items: byType.get(type)! }));
  }, [data]);

  const openResult = (result: NonNullable<typeof data>[number]) => {
    setIsOpen(false);
    let destination = resultRoute(result)!;
    if (result.type === 'project' || result.type === 'agent') {
      const params = new URLSearchParams({ org: activeOrgId });
      const projectId = result.type === 'project' ? result.id : activeProjectId;
      if (projectId) params.set('project', projectId);
      destination += `?${params.toString()}`;
    }
    navigate(destination);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (!data || data.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(() => (activeIndex + 1) % data.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(() => (activeIndex - 1 + data.length) % data.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openResult(data[activeIndex]!);
    }
    // Escape is still `Dialog`'s job — it never reaches this handler because
    // the keydown that closes the dialog is caught on `document`, not here.
  };

  if (!isOpen) return null;

  const hasResults = !!data && data.length > 0;

  // On `Dialog` since M06-T03. This palette handled Escape and nothing else:
  // no role, no aria-modal, no focus trap, and closing it dropped the keyboard
  // user at the top of the document (ADR-0009).
  return (
    <Dialog
      open
      onClose={() => setIsOpen(false)}
      title="Search tasks, artifacts, projects, agents, comments and Memory"
      hideTitle
      className="w-full max-w-lg self-start mt-[10vh]"
    >
      <div className="max-h-[min(348px,calc(90dvh-2rem))] overflow-y-auto scrollbar-thin scroll-pt-12 scroll-pb-2">
        <div className="sticky top-0 z-10 flex items-center border-b bg-surface-raised px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          {/* No autoFocus: `Dialog` focuses the first control itself, and an
              autoFocus here beat it to the punch — it also stole the capture of
              which element opened the palette, so closing dropped the keyboard
              user on <body> (M06-T03). */}
          <input
            role="combobox"
            aria-label="Search workspace"
            ref={inputRef}
            aria-expanded={hasResults}
            aria-controls="global-search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={hasResults ? `search-result-${activeIndex}` : undefined}
            placeholder="Search tasks, artifacts, projects, agents…"
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <button onClick={() => setIsOpen(false)} aria-label="Close search" className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4 opacity-50" />
          </button>
        </div>

        <div
          // The bounded scroll owner includes the sticky input above, keeping
          // keyboard access inside it without adding popup options to Tab order.
          className="min-h-[52px] p-2"
        >
          {activeOrgId && normalizedQuery.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground" role="presentation">
              <p>Search across tasks, artifacts, projects, agents, comments and Memory.</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <kbd className="rounded border bg-muted px-1 font-mono">↑</kbd>
                  <kbd className="rounded border bg-muted px-1 font-mono">↓</kbd>
                  to navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd>
                  to open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded border bg-muted px-1 font-mono">esc</kbd>
                  to close
                </span>
              </div>
            </div>
          )}
          {!activeOrgId && <p role="status" className="p-4 text-center text-sm text-muted-foreground">Select an organization to search its work and knowledge.</p>}
          {isLoading && <p role="status" className="p-4 text-center text-sm text-muted-foreground">Searching…</p>}
          {currentError && !isLoading && <ListState isLoading={false} error={currentError} isEmpty={false} emptyMessage="" errorLabel="Could not search this workspace" onRetry={() => { inputRef.current?.focus(); refetch(); }} />}
          {!isLoading && !currentError && data && data.length === 0 && normalizedQuery && (
            <p role="status" className="p-4 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {hasResults && <p role="status" className="px-2 pb-1 text-xs text-muted-foreground">
            {data!.length} result{data!.length === 1 ? '' : 's'}
          </p>}
          <div id="global-search-listbox" role="listbox" aria-label="Search results" hidden={!hasResults} ref={resultsRef}>
          {hasResults && (
            <div className="space-y-1">
              {groups.map((group) => (
                <div key={group.type} role="group" aria-labelledby={`search-group-${group.type}`}>
                  <div
                    id={`search-group-${group.type}`}
                    className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    {TYPE_LABEL[group.type]} · {group.items.length}
                  </div>
                  {group.items.map(({ result, flatIndex }) => (
                    <button
                      key={result.id}
                      id={`search-result-${flatIndex}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={flatIndex === activeIndex}
                      onMouseMove={() => setHighlighted(flatIndex)}
                      onClick={() => openResult(result)}
                      className={`flex w-full items-start gap-3 rounded-md p-2 text-left ${
                        flatIndex === activeIndex ? 'bg-accent text-accent-foreground' : ''
                      }`}
                    >
                      <div className="mt-0.5 text-muted-foreground shrink-0">
                        {(() => {
                          // No fallback: a result whose type has no route is
                          // filtered out before it reaches here, and every routable
                          // type has an icon — so a `??` branch would be dead code
                          // that only exists to be untested.
                          const Icon = ICON_BY_RESULT_TYPE[result.type]!;
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-medium text-sm truncate">{result.title}</span>
                        {result.snippet && result.snippet !== result.title && (
                          <span className="text-xs text-muted-foreground truncate">
                            <HighlightedSnippet text={result.snippet} matches={result.snippetMatches ?? []} />
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
