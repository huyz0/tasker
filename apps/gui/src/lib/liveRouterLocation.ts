/**
 * Where the user is *now*, not where they were at the last render.
 *
 * A render-time location is not enough: a sidebar click commits to history
 * synchronously, but React re-renders a tick later, and the project
 * auto-select measured landing 11ms after a click — inside that gap — and
 * wrote the scope onto the page the user had just left. When the browser's
 * history belongs to the router (BrowserRouter stamps a `key` into
 * `history.state`), `window.location` is the live truth. Otherwise — a
 * MemoryRouter, as in tests — the render-time location is the only one.
 */
export function currentLocation(rendered: { pathname: string; search: string; hash: string }) {
  if (typeof window !== 'undefined' && window.history.state && 'key' in window.history.state) {
    const { pathname, search, hash } = window.location;
    return { pathname, search, hash };
  }
  return rendered;
}
