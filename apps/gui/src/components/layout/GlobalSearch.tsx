import { useState, useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Search, CheckSquare, FileBox, FolderKanban, Bot, MessageSquare, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { useLayoutStore } from '../../store/layout';
import { Dialog } from '../ui/Dialog';

const searchClient = createClient(SearchService, transport);

// The result types the backend's universalSearch emits, each mapped to the
// route that actually renders that entity. Keeping the mapping in one place is
// what lets a test prove every rendered result has somewhere to go: a result
// with no route here is never rendered, so no click is ever dead.
const ROUTE_BY_RESULT_TYPE: Record<string, (id: string) => string> = {
  task: (id) => `/tasks/${id}`,
  artifact: (id) => `/artifacts/${id}`,
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
};

/**
 * The button that opens the palette. Rendered twice — once in the header for
 * desktop, once in the sidebar for mobile — which is exactly why the palette
 * itself is not rendered here: it used to be, and each copy kept its own `open`
 * state and its own ⌘K listener, so the shortcut opened two stacked modal
 * dialogs (M06-T03).
 */
export function GlobalSearchTrigger() {
  const toggleSearch = useLayoutStore((s) => s.toggleSearch);
  return (
    <button
      onClick={toggleSearch}
      className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 hover:bg-muted/80 px-3 py-1.5 rounded-md border border-border transition-colors w-full min-w-0 justify-between"
    >
      <span className="flex items-center gap-2">
        <Search className="w-4 h-4" />
        Search tasks, artifacts...
      </span>
      <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}

/** The palette itself. Mounted **once**, by `AppShell`. */
export function GlobalSearch() {
  const isOpen = useLayoutStore((s) => s.searchOpen);
  const setIsOpen = useLayoutStore((s) => s.setSearchOpen);
  const toggleSearch = useLayoutStore((s) => s.toggleSearch);
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const navigate = useNavigate();
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);

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

  const { data, isLoading } = useQuery({
    queryKey: ['universalSearch', debouncedQuery, activeOrgId],
    queryFn: async () => {
      // No empty-query guard here: `enabled` below already gates on
      // `debouncedQuery.length > 0`, so react-query never calls this with an
      // empty query. The guard that used to sit here was unreachable.
      const resp = await searchClient.universalSearch({ query: debouncedQuery, orgId: activeOrgId });
      // Drop anything this build has no route for rather than offering the
      // user a result that does nothing when clicked.
      return resp.results.filter((r) => resultRoute(r) !== null);
    },
    enabled: debouncedQuery.length > 0 && isOpen,
  });

  if (!isOpen) return null;

  // On `Dialog` since M06-T03. This palette handled Escape and nothing else:
  // no role, no aria-modal, no focus trap, and closing it dropped the keyboard
  // user at the top of the document (ADR-0009).
  return (
    <Dialog
      open
      onClose={() => setIsOpen(false)}
      title="Search tasks, artifacts, projects, agents and comments"
      hideTitle
      className="w-full max-w-lg self-start mt-[10vh]"
    >
      <div>
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          {/* No autoFocus: `Dialog` focuses the first control itself, and an
              autoFocus here beat it to the punch — it also stole the capture of
              which element opened the palette, so closing dropped the keyboard
              user on <body> (M06-T03). */}
          <input
            placeholder="Type a command or search..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={() => setIsOpen(false)} aria-label="Close search" className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4 opacity-50" />
          </button>
        </div>
        
        <div className="max-h-[300px] min-h-[52px] overflow-y-auto p-2">
          {isLoading && <p className="p-4 text-center text-sm text-muted-foreground">Searching...</p>}
          {!isLoading && data && data.length === 0 && debouncedQuery && (
            <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {!isLoading && data && data.length > 0 && (
            <div className="space-y-1">
              {data.map((result) => (
                <button
                  key={result.id}
                  onClick={() => {
                    setIsOpen(false);
                    navigate(resultRoute(result)!);
                  }}
                  className="flex w-full items-start gap-3 rounded-md p-2 hover:bg-accent hover:text-accent-foreground text-left"
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
                    {result.snippet && (
                      <span className="text-xs text-muted-foreground truncate">
                        <HighlightedSnippet text={result.snippet} matches={result.snippetMatches ?? []} />
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
