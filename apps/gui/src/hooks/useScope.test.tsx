import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderScoped } from '../test/renderScoped';
import { useLayoutStore } from '../store/layout';
import { useScope, useSetScope, useScopeSync, useScopedTo } from './useScope';

/**
 * Scope lives in the URL and is synced into the layout store (ADR-0025).
 * These pin the contract the twenty reading sites depend on without knowing
 * it: they still read the store, and the store now follows the URL.
 */

beforeEach(() => {
  useLayoutStore.setState({ activeOrgId: '', activeProjectId: '' });
});

function ScopeReader() {
  const { orgId, projectId } = useScope();
  return <p>{`org=${orgId || '-'} project=${projectId || '-'}`}</p>;
}

describe('useScope', () => {
  it('reads org and project out of the query string', () => {
    renderScoped(<ScopeReader />, { paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1' });
    expect(screen.getByText('org=o1 project=p1')).toBeInTheDocument();
  });

  it('reports empty when the URL carries no scope, rather than undefined', () => {
    // The store's own initial value is '', and every `enabled:` guard in the
    // application tests falsiness. Returning undefined here would make those
    // guards behave the same but read as a different kind of absence.
    renderScoped(<ScopeReader />, { paths: ['/tasks'], initialEntry: '/tasks' });
    expect(screen.getByText('org=- project=-')).toBeInTheDocument();
  });
});

describe('useSetScope', () => {
  function Setter({ next, replace }: { next: Parameters<ReturnType<typeof useSetScope>>[0]; replace?: boolean }) {
    const setScope = useSetScope();
    return <button onClick={() => setScope(next, { replace })}>set</button>;
  }

  it('writes both ids into the query string', () => {
    const { location } = renderScoped(<Setter next={{ orgId: 'o2', projectId: 'p2' }} />, { paths: ['/tasks'] });
    fireEvent.click(screen.getByRole('button'));
    expect(location.search).toContain('org=o2');
    expect(location.search).toContain('project=p2');
  });

  it('leaves unrelated query parameters alone', () => {
    // Bin's tab and Memory's scope toggle share the query string with scope.
    const { location } = renderScoped(<Setter next={{ orgId: 'o2' }} />, {
      paths: ['/bin'], initialEntry: '/bin?tab=tasks&org=o1',
    });
    fireEvent.click(screen.getByRole('button'));
    expect(location.search).toContain('tab=tasks');
    expect(location.search).toContain('org=o2');
  });

  it('removes a key rather than writing an empty value', () => {
    // Choosing an org clears the project — the old org's projects are not
    // this one's. `?project=` would be a scope that reads as present.
    const { location } = renderScoped(<Setter next={{ orgId: 'o2', projectId: '' }} />, {
      paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1',
    });
    fireEvent.click(screen.getByRole('button'));
    expect(location.search).not.toContain('project=');
    expect(location.search).toContain('org=o2');
  });

  it('leaves a key untouched when it is not named at all', () => {
    const { location } = renderScoped(<Setter next={{ projectId: 'p9' }} />, {
      paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1',
    });
    fireEvent.click(screen.getByRole('button'));
    expect(location.search).toContain('org=o1');
    expect(location.search).toContain('project=p9');
  });
});

describe('useScopeSync', () => {
  function Synced() {
    useScopeSync();
    const orgId = useLayoutStore((s) => s.activeOrgId);
    const projectId = useLayoutStore((s) => s.activeProjectId);
    return <p>{`store org=${orgId || '-'} project=${projectId || '-'}`}</p>;
  }

  it('writes the URL scope into the store, which is what every screen reads', () => {
    renderScoped(<Synced />, { paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1' });
    expect(screen.getByText('store org=o1 project=p1')).toBeInTheDocument();
  });

  it('starts empty and fills a tick later — the hydration the M23 guard needs', () => {
    // `Tasks`'s previousScope ref tells hydration from a real switch by the
    // previous project being empty. That only stays true while the store
    // starts empty and the URL fills it after the first render. If this ever
    // becomes synchronous, that guard goes dead and deep links break on
    // reload again.
    expect(useLayoutStore.getState().activeProjectId).toBe('');
    renderScoped(<Synced />, { paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1' });
    expect(useLayoutStore.getState().activeProjectId).toBe('p1');
  });

  it('clears the store when the URL drops the scope', () => {
    useLayoutStore.setState({ activeOrgId: 'stale', activeProjectId: 'stale' });
    renderScoped(<Synced />, { paths: ['/tasks'], initialEntry: '/tasks' });
    expect(screen.getByText('store org=- project=-')).toBeInTheDocument();
  });
});

describe('useScopedTo', () => {
  function Linker({ to }: { to: string }) {
    const scopedTo = useScopedTo();
    return <p>{scopedTo(to)}</p>;
  }

  it('carries the current scope onto a path', () => {
    renderScoped(<Linker to="/reports" />, { paths: ['/tasks'], initialEntry: '/tasks?org=o1&project=p1' });
    expect(screen.getByText('/reports?org=o1&project=p1')).toBeInTheDocument();
  });

  it('returns the path unchanged when there is no scope to carry', () => {
    renderScoped(<Linker to="/reports" />, { paths: ['/tasks'], initialEntry: '/tasks' });
    expect(screen.getByText('/reports')).toBeInTheDocument();
  });

  it('carries an org with no project', () => {
    renderScoped(<Linker to="/teams" />, { paths: ['/tasks'], initialEntry: '/tasks?org=o1' });
    expect(screen.getByText('/teams?org=o1')).toBeInTheDocument();
  });

  it('does not carry a screen-local parameter across screens', () => {
    // `?tab=` belongs to Bin, not to the next screen.
    renderScoped(<Linker to="/reports" />, { paths: ['/bin'], initialEntry: '/bin?org=o1&tab=tasks' });
    expect(screen.getByText('/reports?org=o1')).toBeInTheDocument();
  });
});
