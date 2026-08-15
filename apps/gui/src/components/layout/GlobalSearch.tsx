import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { transport } from "../../lib/connectTransport";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Search, CheckSquare, FileBox, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';
import { useLayoutStore } from '../../store/layout';
import { Dialog } from '../ui/Dialog';

const searchClient = createClient(SearchService, transport);

// The only result types the backend's universalSearch emits, each mapped to
// the route that actually renders that entity. Keeping the mapping in one
// place is what lets a test prove every rendered result has somewhere to go:
// a result with no route here is never rendered, so no click is ever dead.
const ROUTE_BY_RESULT_TYPE: Record<string, (id: string) => string> = {
  task: (id) => `/tasks/${id}`,
  artifact: (id) => `/artifacts/${id}`,
};

export function resultRoute(result: { type: string; id: string }): string | null {
  return ROUTE_BY_RESULT_TYPE[result.type]?.(result.id) ?? null;
}

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
      if (!debouncedQuery) return [];
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
      title="Search tasks and artifacts"
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
                    {result.type === 'task' ? <CheckSquare className="h-4 w-4" /> : <FileBox className="h-4 w-4" />}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium text-sm truncate">{result.title}</span>
                    {result.snippet && (
                      <span className="text-xs text-muted-foreground truncate">{result.snippet}</span>
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
