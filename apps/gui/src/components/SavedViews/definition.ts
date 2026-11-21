import { create } from '@bufbuild/protobuf';
import { z } from 'zod/v4';
import { SavedViewDefinitionSchema, type SavedViewDefinition, type SavedViewMetadata } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { parseReportView, parseTaskView, reportViewParams, taskViewParams, TASK_SORT_FIELDS } from '../../lib/operationalView';

export type ViewScreen = 'tasks' | 'reports';
export interface ViewLocation { pathname: string; search: string; hash: string; }
export const viewNameSchema = z.string().transform(value => value.trim().normalize('NFC')).pipe(z.string().min(1, 'Enter a name.').max(128, 'Use at most 128 characters.').regex(/^[^\u0000-\u001f\u007f]*$/u, 'Remove control characters.'));
export function definitionFromUrl(screen: ViewScreen, search: string): SavedViewDefinition {
  const params = new URLSearchParams(search);
  if (screen === 'reports') return create(SavedViewDefinitionSchema, { version: 1, screen, reports: parseReportView(params).value });
  const state = parseTaskView(params).value;
  return create(SavedViewDefinitionSchema, { version: 1, screen, tasks: {
    viewMode: state.viewMode === 'table' ? 'table' : 'board', search: state.search, ready: state.readyOnly,
    ...(state.priorityFilter !== '' ? { priority: Number(state.priorityFilter) } : {}),
    ...(state.sort ? { sort: `${TASK_SORT_FIELDS[state.sort.key]}:${state.sort.dir}` } : {}),
  } });
}
export function locationFromSavedView(location: ViewLocation, view: SavedViewMetadata, definition: SavedViewDefinition,
  screen: ViewScreen, orgId: string, accountId: string): ViewLocation {
  const refuse = () => { throw new Error('This saved view is unavailable. Keep your current view or save a new definition.'); };
  if (!view.projectId || view.orgId !== orgId || view.screen !== screen || definition.version !== 1 || definition.screen !== screen
    || !['personal', 'organization'].includes(view.visibility) || (view.visibility === 'personal' && view.ownerUserId !== accountId)) return refuse();
  const current = new URLSearchParams(location.search);
  let next: URLSearchParams;
  if (screen === 'tasks') {
    const query = definition.tasks;
    if (!query || definition.reports) return refuse();
    const params = new URLSearchParams();
    if (query.viewMode !== undefined) params.set('view', query.viewMode);
    if (query.search !== undefined) params.set('q', query.search);
    if (query.priority !== undefined) params.set('priority', String(query.priority));
    if (query.ready !== undefined) params.set('ready', query.ready ? '1' : '0');
    if (query.sort !== undefined) params.set('sort', query.sort);
    const parsed = parseTaskView(params);if (parsed.invalid.length) return refuse();
    next = taskViewParams(current, parsed.value);
  } else {
    if (!definition.reports || definition.tasks) return refuse();
    const params = new URLSearchParams();if (definition.reports.windowDays !== undefined) params.set('days', String(definition.reports.windowDays));
    const parsed = parseReportView(params);if (parsed.invalid.length) return refuse();
    next = reportViewParams(current, parsed.value);
  }
  next.set('org', orgId);next.set('project', view.projectId);
  return { pathname: `/${screen}`, search: `?${next.toString()}`, hash: location.hash };
}
