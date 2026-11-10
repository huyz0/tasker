/** Supported screen settings only; these contain neither resource access nor results. */
export const TASK_SORT_FIELDS = { displayId: 'createdAt', priority: 'priority', title: 'title', status: 'status' } as const;
export type TaskSortKey = keyof typeof TASK_SORT_FIELDS;
export interface TaskViewState {
  viewMode: 'card' | 'table'; search: string; priorityFilter: string; readyOnly: boolean;
  sort: { key: TaskSortKey; dir: 'asc' | 'desc' } | null;
}
export const DEFAULT_TASK_VIEW: TaskViewState = { viewMode: 'card', search: '', priorityFilter: '', readyOnly: false, sort: null };
export const REPORT_WINDOWS = [7, 30, 90] as const;
export interface ReportViewState { windowDays: typeof REPORT_WINDOWS[number]; }
export const DEFAULT_REPORT_VIEW: ReportViewState = { windowDays: 30 };
export interface ParsedView<T> { value: T; invalid: string[]; }

function field(params: URLSearchParams, key: string, valid: (value: string) => boolean, invalid: string[]) {
  const values = params.getAll(key);
  if (!values.length) return undefined;
  if (values.length === 1 && valid(values[0]!)) return values[0]!;
  invalid.push(key);return undefined;
}
export function parseTaskView(params: URLSearchParams): ParsedView<TaskViewState> {
  const invalid: string[] = [];
  const mode = field(params, 'view', value => value === 'board' || value === 'table', invalid);
  const search = field(params, 'q', value => value.length <= 500 && !/[\u0000-\u001f\u007f]/u.test(value), invalid);
  const priority = field(params, 'priority', value => value === '' || /^[0-4]$/.test(value), invalid);
  const ready = field(params, 'ready', value => value === '0' || value === '1', invalid);
  const sort = field(params, 'sort', value => value === '' || /^(createdAt|priority|title|status):(asc|desc)$/.test(value), invalid);
  const [sortField, direction] = sort?.split(':') ?? [];
  const sortKey = (Object.keys(TASK_SORT_FIELDS) as TaskSortKey[]).find(key => TASK_SORT_FIELDS[key] === sortField);
  return { value: { viewMode: mode === 'table' ? 'table' : 'card', search: search ?? '', priorityFilter: priority ?? '',
    readyOnly: ready === '1', sort: sortKey ? { key: sortKey, dir: direction === 'desc' ? 'desc' : 'asc' } : null }, invalid };
}
export function taskViewParams(current: URLSearchParams, value: TaskViewState) {
  const next = new URLSearchParams(current);
  for (const key of ['view', 'q', 'priority', 'ready', 'sort']) next.delete(key);
  if (value.viewMode === 'table') next.set('view', 'table');
  if (value.search) next.set('q', value.search);
  if (value.priorityFilter !== '') next.set('priority', value.priorityFilter);
  if (value.readyOnly) next.set('ready', '1');
  // The visible ID column retains its existing creation-order server sort.
  if (value.sort) next.set('sort', `${TASK_SORT_FIELDS[value.sort.key]}:${value.sort.dir}`);
  return next;
}
export function parseReportView(params: URLSearchParams): ParsedView<ReportViewState> {
  const invalid: string[] = [];
  const days = field(params, 'days', value => /^(7|30|90)$/.test(value), invalid);
  return { value: { windowDays: days ? Number(days) as ReportViewState['windowDays'] : 30 }, invalid };
}
export function reportViewParams(current: URLSearchParams, value: ReportViewState) {
  const next = new URLSearchParams(current);next.delete('days');
  if (value.windowDays !== 30) next.set('days', String(value.windowDays));
  return next;
}
export function taskViewPath(to: string, value: TaskViewState) {
  const target = new URL(to, 'https://tasker.invalid');
  target.search = taskViewParams(target.searchParams, value).toString();
  return target.pathname + target.search + target.hash;
}
