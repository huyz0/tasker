import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { SearchService } from "shared-contract/gen/ts/tasker/health/v1/health_pb";
import { Search, CheckSquare, FileBox, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';

const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
const searchClient = createClient(SearchService, transport);

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['universalSearch', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const resp = await searchClient.universalSearch({ query: debouncedQuery });
      return resp.results;
    },
    enabled: debouncedQuery.length > 0 && isOpen,
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 hover:bg-muted/80 px-3 py-1.5 rounded-md border border-border transition-colors w-64 justify-between"
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

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      <div className="fixed left-[50%] top-[20%] z-50 w-full max-w-lg translate-x-[-50%] rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            autoFocus
            placeholder="Type a command or search..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={() => setIsOpen(false)} className="rounded-full p-1 hover:bg-muted">
            <X className="h-4 w-4 opacity-50" />
          </button>
        </div>
        
        <div className="max-h-[300px] overflow-y-auto p-2">
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
                    // Navigate to appropriate route
                    if (result.type === 'task') navigate(`/tasks/${result.id}`);
                    if (result.type === 'artifact') navigate(`/artifacts/${result.id}`);
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
    </>
  );
}
