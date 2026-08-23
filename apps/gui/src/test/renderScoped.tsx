import { cloneElement, type ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

/**
 * Render a screen at a URL, with a router and a query client (M28-T02).
 *
 * Nineteen test files mock the layout store and nine render with no router at
 * all, every one of them rolling its own `MemoryRouter` +
 * `QueryClientProvider` + location probe. M28 moves scope into the URL, which
 * touches all of them — so the change lands against this one helper rather
 * than thirty bespoke setups.
 *
 * Deliberately *not* a scope-setter: screens read scope from the layout store,
 * and the store is fed from the URL by one sync point (ADR-0025). A test that
 * needs a scope puts it in `initialEntry` like the application does.
 */

/** Where the router currently is. Mutated in place on every render. */
export interface LocationRef {
  pathname: string;
  /** Including the leading `?`, or `''` — matching `useLocation().search`. */
  search: string;
  /** `pathname + search`, which is what a user would copy out of the bar. */
  url: string;
}

export interface RenderScopedOptions {
  /**
   * Route patterns to mount the element at — the same set the application
   * mounts, so a deep-link test exercises the real matching. Omit for a
   * screen with no route params.
   */
  paths?: string[];
  /** Where to start. Defaults to the first entry in `paths`. */
  initialEntry?: string;
  /** Supply one to seed the cache, or to share it across a rerender. */
  queryClient?: QueryClient;
}

export interface RenderScopedResult extends Omit<RenderResult, 'rerender'> {
  location: LocationRef;
  queryClient: QueryClient;
  /**
   * Re-render the same tree, in place.
   *
   * Takes no element: the point of a rerender here is that something
   * *outside* the tree changed — the mocked layout store, most often — and
   * the component must be given a chance to react without remounting. A
   * remount would reset the very state these tests are asserting about.
   */
  rerender: () => void;
}

export function renderScoped(
  ui: ReactElement,
  { paths, initialEntry, queryClient }: RenderScopedOptions = {},
): RenderScopedResult {
  const location: LocationRef = { pathname: '', search: '', url: '' };

  function LocationProbe() {
    const current = useLocation();
    location.pathname = current.pathname;
    location.search = current.search;
    location.url = `${current.pathname}${current.search}`;
    return null;
  }

  const client = queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const entry = initialEntry ?? paths?.[0] ?? '/';

  // Rebuilt per render, and `ui` cloned with it. The clone is load-bearing:
  // handed back the *same* element object, React sees `oldProps === newProps`,
  // bails out before `beginWork` and skips the subtree entirely — so a
  // rerender driven by a change *outside* the tree (a mocked store, which is
  // the only reason these tests rerender at all) would paint nothing. A clone
  // is a new props object, so React reconciles; the type and position are
  // unchanged, so it reconciles rather than remounts and state survives.
  const buildTree = () => {
    const element = cloneElement(ui);
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <LocationProbe />
          {paths && paths.length > 0
            ? <Routes>{paths.map((path) => <Route key={path} path={path} element={element} />)}</Routes>
            : element}
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  const result = render(buildTree());
  return {
    ...result,
    location,
    queryClient: client,
    rerender: () => result.rerender(buildTree()),
  };
}
