import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { renderScoped } from './renderScoped';

/**
 * The helper every feature test renders through (M28-T02).
 *
 * It exists because nineteen test files mock the layout store and nine render
 * with no router at all, each rolling its own MemoryRouter +
 * QueryClientProvider. Moving scope into the URL touches all of them, so the
 * change lands against one setup rather than thirty.
 *
 * Its own behaviour is pinned here rather than only exercised through the
 * suites that use it: a broken helper would fail those suites in ways that
 * look like product bugs.
 */

function Probe() {
  const { taskId } = useParams();
  return <p>task: {taskId ?? 'none'}</p>;
}

describe('renderScoped', () => {
  it('mounts at the requested entry', () => {
    renderScoped(<Probe />, { paths: ['/tasks', '/tasks/:taskId'], initialEntry: '/tasks/t-1' });
    expect(screen.getByText('task: t-1')).toBeInTheDocument();
  });

  it('defaults the entry to the first path when none is given', () => {
    renderScoped(<Probe />, { paths: ['/tasks', '/tasks/:taskId'] });
    expect(screen.getByText('task: none')).toBeInTheDocument();
  });

  it('exposes the pathname, the search string and the two together', () => {
    const { location } = renderScoped(<Probe />, {
      paths: ['/tasks'],
      initialEntry: '/tasks?org=org-1&project=proj-1',
    });
    expect(location.pathname).toBe('/tasks');
    expect(location.search).toBe('?org=org-1&project=proj-1');
    expect(location.url).toBe('/tasks?org=org-1&project=proj-1');
  });

  it('tracks navigation, so a test can assert where a click went', () => {
    function Navigator() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/tasks/t-9')}>open</button>;
    }
    const { location } = renderScoped(<Navigator />, { paths: ['/tasks', '/tasks/:taskId'] });
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(location.pathname).toBe('/tasks/t-9');
  });

  it('rerenders in place, keeping component state — the scope-change idiom', () => {
    // The `previousScope` suites mutate a mocked store and rerender to
    // simulate a scope change. That only tells us anything if the tree is
    // re-rendered rather than remounted, so state has to survive.
    function Counter() {
      const [n, setN] = useState(0);
      return <button onClick={() => setN(n + 1)}>count {n}</button>;
    }
    const { rerender } = renderScoped(<Counter />, { paths: ['/tasks'] });
    fireEvent.click(screen.getByRole('button', { name: 'count 0' }));
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();

    rerender();
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();
  });

  it('actually re-renders on a change from outside the tree', () => {
    // The other half of the scope-change idiom, and the easy one to get
    // wrong: handed back an element it has already seen, React bails out
    // before rendering and the subtree never runs. A rerender that preserved
    // state by doing nothing at all would pass the test above and still tell
    // the `previousScope` suites nothing.
    let external = 'a';
    function Reader() {
      return <p>ext {external}</p>;
    }
    const { rerender } = renderScoped(<Reader />, { paths: ['/tasks'] });
    expect(screen.getByText('ext a')).toBeInTheDocument();

    external = 'b';
    rerender();
    expect(screen.getByText('ext b')).toBeInTheDocument();
  });

  it('exposes its query client so a test can seed or inspect the cache', () => {
    const { queryClient } = renderScoped(<Probe />, { paths: ['/tasks'] });
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(false);
  });

  it('renders unrouted components too, for screens with no route params', () => {
    renderScoped(<p>plain</p>);
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('reports the location of the entry itself, before any navigation', () => {
    function Reader() {
      const loc = useLocation();
      return <p>at {loc.pathname}</p>;
    }
    const { location } = renderScoped(<Reader />, { paths: ['/bin'], initialEntry: '/bin?tab=tasks' });
    expect(screen.getByText('at /bin')).toBeInTheDocument();
    expect(location.search).toBe('?tab=tasks');
  });
});
