import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A screen's own navigational state, carried in the URL (M28, ADR-0025).
 *
 * Scope (`useScope`) says *which project* you are in; this says *what you are
 * looking at* within a screen — Bin's tab, Organizations' section, Memory's
 * project-or-organization toggle. All three were `useState`, so a reload or a
 * link sent to someone else always landed on the screen's default no matter
 * what was on screen when the URL was copied.
 *
 * The value is validated on the way out rather than trusted: a URL is typed,
 * edited and kept long after a value stops being one the screen knows. An
 * unrecognised or absent value reads as the default, so the worst a stale link
 * can do is open the screen where it always opened — never render nothing,
 * which is exactly what a Radix `Tabs.Root` does when handed a value none of
 * its triggers own.
 *
 * Setting writes through the functional updater and copies the existing
 * parameters, for the reason `useSetScope` does: the screen shares its query
 * string with `?org`/`?project`, and neither may clobber the other.
 */
export function useUrlEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;

  const setValue = useCallback(
    (next: T) => {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        updated.set(key, next);
        return updated;
      });
    },
    // `setParams` is stable and the updater closes over nothing that moves, so
    // this callback keeps one identity for the life of the screen.
    [setParams, key],
  );

  return [value, setValue];
}
