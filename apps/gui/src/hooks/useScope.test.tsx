import { describe, it, expect, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { Link } from 'react-router-dom';
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

describe('useSetScope after the user has navigated', () => {
  // The switcher auto-selects a scope when its org list arrives. If the user
  // clicked a sidebar link in the meantime, that late write used to resolve
  // against the page the shell was rendered on and send them back there —
  // the first click after load was silently undone.
  let captured: ReturnType<typeof useSetScope> | null = null;
  function Shell() {
    const setScope = useSetScope();
    captured ??= setScope;
    return <Link to="/settings">Settings</Link>;
  }

  it('keeps the page the user moved to', () => {
    captured = null;
    const { location } = renderScoped(<Shell />, { paths: ['*'], initialEntry: '/' });
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(location.pathname).toBe('/settings');

    act(() => captured!({ orgId: 'o1', projectId: 'p1' }, { replace: true }));

    expect(location.pathname).toBe('/settings');
    expect(location.search).toContain('org=o1');
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

describe('useSetScope under a browser router', () => {
  it('writes onto the URL the browser is at, even before React has re-rendered', () => {
    // Simulate the gap: the browser history has moved on (BrowserRouter's
    // stamped state), the rendered location has not.
    window.history.pushState({ key: 'k1', idx: 1, usr: null }, '', '/settings');
    try {
      let setScope: ReturnType<typeof useSetScope> | null = null;
      function Grab() {
        setScope = useSetScope();
        return null;
      }
      const { location } = renderScoped(<Grab />, { paths: ['*'], initialEntry: '/' });
      act(() => setScope!({ orgId: 'o1' }, { replace: true }));
      expect(location.pathname).toBe('/settings');
      expect(location.search).toBe('?org=o1');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});
