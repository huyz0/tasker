import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { currentLocation } from '../lib/liveRouterLocation';
import {
  DEFAULT_REPORT_VIEW, DEFAULT_TASK_VIEW, parseReportView, parseTaskView, reportViewParams, taskViewParams,
  type ParsedView, type ReportViewState, type TaskViewState,
} from '../lib/operationalView';

interface ViewSpec<T> {
  owns(pathname: string): boolean; parse(params: URLSearchParams): ParsedView<T>;
  write(params: URLSearchParams, value: T): URLSearchParams; defaults: T;
}
type Change<T> = Partial<T> | ((current: T) => T);
const tasks: ViewSpec<TaskViewState> = { owns: path => /^\/tasks(?:\/[^/]+)?\/?$/.test(path),
  parse: parseTaskView, write: taskViewParams, defaults: DEFAULT_TASK_VIEW };
const reports: ViewSpec<ReportViewState> = { owns: path => /^\/reports\/?$/.test(path),
  parse: parseReportView, write: reportViewParams, defaults: DEFAULT_REPORT_VIEW };

function useUrlView<T>(spec: ViewSpec<T>) {
  const location = useLocation(), navigate = useNavigate(), latest = useRef(location), mounted = useRef(true);
  latest.current = location;
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const parsed = spec.parse(new URLSearchParams(location.search));
  const update = useCallback((change: Change<T>, options?: { replace?: boolean }) => {
    const live = currentLocation(latest.current);
    if (!mounted.current || !spec.owns(live.pathname)) return;
    const params = new URLSearchParams(live.search), parsedBefore = spec.parse(params), before = parsedBefore.value;
    const value = typeof change === 'function' ? change(before) : { ...before, ...change };
    const next = spec.write(params, value);
    // Compare supported meanings, including explicit defaults and key order.
    // Malformed settings must still navigate so Reset can remove them.
    const previousOrder = spec.write(params, before), nextOrder = new URLSearchParams(next);
    previousOrder.sort();nextOrder.sort();
    if (!parsedBefore.invalid.length && nextOrder.toString() === previousOrder.toString()) return;
    const query = next.toString();
    navigate({ pathname: live.pathname, search: query ? `?${query}` : '', hash: live.hash }, { replace: options?.replace ?? false });
  }, [navigate, spec]);
  const navigateWithinView = useCallback((pathname: string) => {
    const live = currentLocation(latest.current);
    if (!mounted.current || !spec.owns(live.pathname) || !spec.owns(pathname)) return;
    const params = new URLSearchParams(live.search);
    const query = spec.write(params, spec.parse(params).value).toString();
    navigate({ pathname, search: query ? `?${query}` : '', hash: live.hash });
  }, [navigate, spec]);
  return { ...parsed, update, reset: () => update(spec.defaults), navigateWithinView };
}
export const useTaskView = () => useUrlView(tasks);
export const useReportView = () => useUrlView(reports);
