import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@connectrpc/connect';
import { useDebounce } from 'use-debounce';
import { ChevronsUpDown } from 'lucide-react';
import { transport } from '../../lib/connectTransport';
import { OrgService, ProjectService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { useLayoutStore } from '../../store/layout';
import { ListState } from '../ui/ListState';

const orgClient = createClient(OrgService, transport);
const projectClient = createClient(ProjectService, transport);

/** One bounded page. This is a search result, not a catalogue. */
const PAGE = 10;

interface Choice {
  id: string;
  label: string;
  /** Nesting depth, rendered as indentation. Organizations form a tree. */
  depth?: number;
}

/**
 * A searchable single-select over a set too large to render.
 *
 * The two `<select>` elements this replaces paged through **every**
 * organization and **every** project before the switcher was usable — the same
 * unbounded-list shape M03 spent a milestone removing from the backend and
 * M05-T04 reintroduced on the client. At 2,000 projects that is 20 requests
 * before the first paint of the primary navigation control.
 *
 * A native `<select>` also cannot search, cannot indent a hierarchy, and cannot
 * tell the user that what they are looking at is the first ten of two thousand.
 */
function SearchSelect({
  label,
  value,
  valueLabel,
  choices,
  total,
  isLoading,
  error,
  onRetry,
  search,
  onSearch,
  onPick,
  emptyMessage,
}: {
  label: string;
  value: string;
  valueLabel: string;
  choices: Choice[];
  total: number;
  isLoading: boolean;
  /** The query error. Without it a failed list said "No organizations", which
   *  is the same words as an account that genuinely has none (M06-T11). */
  error: unknown;
  onRetry: () => void;
  search: string;
  onSearch: (next: string) => void;
  onPick: (choice: Choice) => void;
  emptyMessage: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setActive(0), [choices.length, search]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      // Clicking anywhere else is a dismissal — otherwise the panel follows the
      // user around the page.
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const close = () => { setIsOpen(false); onSearch(''); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, choices.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && choices[active]) { e.preventDefault(); onPick(choices[active]); close(); }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      >
        <span className="truncate">{valueLabel || (error ? 'Unavailable' : emptyMessage)}</span>
        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute z-40 mt-1 w-full rounded-md border bg-card shadow-lg p-1 flex flex-col gap-1">
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-label={`Search ${label.toLowerCase()}`}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type to search"
            className="rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />

          {isLoading && <span className="px-2 py-1 text-xs text-muted-foreground">Searching…</span>}

          <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
            {choices.map((choice, i) => (
              <li key={choice.id} role="none">
                <button
                  role="option"
                  aria-selected={choice.id === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { onPick(choice); close(); }}
                  onKeyDown={onKeyDown}
                  style={{ paddingLeft: 8 + (choice.depth ?? 0) * 12 }}
                  className={`w-full text-left pr-2 py-1 text-sm rounded ${
                    i === active ? 'bg-accent text-accent-foreground' : ''
                  } ${choice.id === value ? 'font-medium text-primary' : ''}`}
                >
                  {choice.label}
                </button>
              </li>
            ))}
          </ul>

          {error ? (
            <ListState
              isLoading={false}
              error={error}
              isEmpty={false}
              emptyMessage=""
              onRetry={onRetry}
            />
          ) : (
            !isLoading && choices.length === 0 && (
              <span className="px-2 py-1 text-xs text-muted-foreground">
                {search ? 'Nothing matches that.' : emptyMessage}
              </span>
            )
          )}

          {total > choices.length && (
            <span role="status" className="px-2 py-1 text-xs text-muted-foreground">
              Showing {choices.length} of {total} — keep typing to narrow it down.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function OrgProjectSwitcher() {
  const activeOrgId = useLayoutStore((s) => s.activeOrgId);
  const activeProjectId = useLayoutStore((s) => s.activeProjectId);
  const setActiveOrgId = useLayoutStore((s) => s.setActiveOrgId);
  const setActiveProjectId = useLayoutStore((s) => s.setActiveProjectId);

  const [orgLabel, setOrgLabel] = useState('');
  const [projectLabel, setProjectLabel] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [debouncedOrgSearch] = useDebounce(orgSearch, 250);
  const [debouncedProjectSearch] = useDebounce(projectSearch, 250);

  const orgsQuery = useQuery({
    queryKey: ['orgs', 'switcher', debouncedOrgSearch],
    queryFn: async () => {
      const r = await orgClient.listOrgs({ page: { limit: PAGE, filter: debouncedOrgSearch || undefined } });
      return { orgs: r.organizations, total: Number(r.page?.totalCount ?? r.organizations.length) };
    },
  });

  const projectsQuery = useQuery({
    queryKey: ['projects', 'switcher', activeOrgId, debouncedProjectSearch],
    enabled: Boolean(activeOrgId),
    queryFn: async () => {
      const r = await projectClient.listProjects({
        orgId: activeOrgId,
        page: { limit: PAGE, filter: debouncedProjectSearch || undefined },
      });
      return { projects: r.projects, total: Number(r.page?.totalCount ?? r.projects.length) };
    },
  });

  const orgs = orgsQuery.data?.orgs ?? [];
  const projects = projectsQuery.data?.projects ?? [];

  // Nothing selected yet: take the first of the first page. The old switcher
  // did the same, only after fetching every page first.
  useEffect(() => {
    if (orgs.length === 0) return;
    if (!activeOrgId) {
      setActiveOrgId(orgs[0].id);
      setOrgLabel(orgs[0].name);
    } else if (!orgLabel) {
      const found = orgs.find((o: any) => o.id === activeOrgId);
      if (found) setOrgLabel(found.name);
    }
  }, [orgs, activeOrgId, orgLabel, setActiveOrgId]);

  useEffect(() => {
    if (projects.length === 0) return;
    // Only when nothing is chosen. The old switcher held *every* project, so
    // "the active one is not in this list" meant it was gone; with one page it
    // means it is on another page — and re-selecting projects[0] there silently
    // threw away the choice the user just made. Picking project 1234 of 2000
    // put the switcher back on project 0999 (M06-T09).
    if (!activeProjectId) {
      setActiveProjectId(projects[0].id);
      setProjectLabel(projects[0].name);
      return;
    }
    if (!projectLabel) {
      const found = projects.find((p: any) => p.id === activeProjectId);
      if (found) setProjectLabel(found.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeProjectId]);

  /**
   * Organizations are a tree. Within the page that came back, a child sits one
   * level in from its parent; an org whose parent is not on this page is shown
   * at the top level rather than hidden, because a search result you cannot see
   * is worse than one shown out of context.
   */
  const orgChoices: Choice[] = (() => {
    const present = new Set(orgs.map((o: any) => o.id));
    const depthOf = (org: any, seen = 0): number => {
      if (!org?.parentOrgId || !present.has(org.parentOrgId) || seen > orgs.length) return 0;
      return 1 + depthOf(orgs.find((o: any) => o.id === org.parentOrgId), seen + 1);
    };
    return orgs.map((o: any) => ({ id: o.id, label: o.name, depth: depthOf(o) }));
  })();

  return (
    <div className="flex flex-col gap-2 px-4 py-3 border-b">
      <SearchSelect
        label="Active organization"
        value={activeOrgId}
        valueLabel={orgLabel}
        choices={orgChoices}
        total={orgsQuery.data?.total ?? 0}
        isLoading={orgsQuery.isLoading}
        error={orgsQuery.error}
        onRetry={() => orgsQuery.refetch()}
        search={orgSearch}
        onSearch={setOrgSearch}
        onPick={(choice) => {
          setActiveOrgId(choice.id);
          setOrgLabel(choice.label);
          // The projects of the old organization are not the projects of this
          // one, and keeping the stale id would leave every list empty.
          setActiveProjectId('');
          setProjectLabel('');
        }}
        emptyMessage={orgsQuery.isLoading ? 'Loading organizations…' : 'No organizations'}
      />
      <SearchSelect
        label="Active project"
        value={activeProjectId}
        valueLabel={projectLabel}
        choices={projects.map((p: any) => ({ id: p.id, label: p.name }))}
        total={projectsQuery.data?.total ?? 0}
        isLoading={projectsQuery.isLoading}
        error={projectsQuery.error}
        onRetry={() => projectsQuery.refetch()}
        search={projectSearch}
        onSearch={setProjectSearch}
        onPick={(choice) => { setActiveProjectId(choice.id); setProjectLabel(choice.label); }}
        emptyMessage="No projects"
      />
    </div>
  );
}
