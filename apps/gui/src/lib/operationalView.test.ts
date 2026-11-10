import { describe, expect, it } from 'vitest';
import { parseTaskView, taskViewParams, parseReportView, reportViewParams, taskViewPath } from './operationalView';

describe('Supported operational view URLs', () => {
  it('round-trips a filtered table with no-priority, Unicode text and creation-order ID sort', () => {
    const original = new URLSearchParams('org=org-A&project=project-A&marker=keep&view=table&priority=0&ready=1&sort=createdAt:desc&q=release+%E2%9C%93');
    const parsed = parseTaskView(original);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.value).toEqual({ viewMode: 'table', priorityFilter: '0', readyOnly: true, search: 'release ✓', sort: { key: 'displayId', dir: 'desc' } });
    const next = taskViewParams(original, parsed.value);
    expect(parseTaskView(next)).toEqual(parsed);
    expect(next.get('org')).toBe('org-A');expect(next.get('project')).toBe('project-A');expect(next.get('marker')).toBe('keep');
    expect(taskViewPath('/tasks/task-A?org=org-A&project=project-A#summary', parsed.value)).toContain('sort=createdAt%3Adesc');
    expect(taskViewPath('/tasks?org=org-A', parsed.value)).toContain('priority=0');
  });
  it.each(['view', 'q', 'priority', 'ready', 'sort'])('rejects duplicate %s values instead of selecting an ambiguous filter', key => {
    const params = new URLSearchParams('org=org-A&project=project-A');
    const values = { view: ['table', 'board'], q: ['first', 'second'], priority: ['0', '4'], ready: ['1', '0'], sort: ['title:asc', 'priority:desc'] };
    for (const value of values[key as keyof typeof values]) params.append(key, value);
    expect(parseTaskView(params).invalid).toEqual([key]);
    const reset = taskViewParams(params, parseTaskView(new URLSearchParams()).value);
    expect(reset.has(key)).toBe(false);expect(reset.get('org')).toBe('org-A');expect(reset.get('project')).toBe('project-A');
  });
  it.each(['x'.repeat(501), 'hidden\u0000query', 'line\nquery'])('rejects overlong/control text rather than submitting an invisible query (%j)', text => {
    const params = new URLSearchParams({ q: text, view: 'table' });
    expect(parseTaskView(params)).toMatchObject({ value: { search: '', viewMode: 'table' }, invalid: ['q'] });
  });
  it.each(['priority:asc', 'title:desc', 'status:asc', 'createdAt:asc'])('retains supported server sorting (%s)', sort => {
    const params = new URLSearchParams({ sort });
    expect(parseTaskView(params).invalid).toEqual([]);
    expect(taskViewParams(new URLSearchParams(), parseTaskView(params).value).get('sort')).toBe(sort);
  });
  it('keeps harmless false/empty settings as defaults and rejects unsupported scalars', () => {
    expect(parseTaskView(new URLSearchParams('priority=&ready=0&sort=')).invalid).toEqual([]);
    const parsed = parseTaskView(new URLSearchParams('view=unknown&priority=-1&ready=true&sort=title;DROP&q=valid'));
    expect(parsed.invalid).toEqual(['view', 'priority', 'ready', 'sort']);
    expect(parsed.value).toMatchObject({ viewMode: 'card', priorityFilter: '', readyOnly: false, sort: null, search: 'valid' });
  });
  it.each([7, 30, 90])('round-trips a supported report window without changing scope (%s)', days => {
    const original = new URLSearchParams({ org: 'org-A', project: 'project-A', marker: 'keep', days: String(days) });
    const parsed = parseReportView(original), next = reportViewParams(original, parsed.value);
    expect(parsed).toEqual({ value: { windowDays: days }, invalid: [] });
    expect(parseReportView(next)).toEqual(parsed);
    expect(next.get('org')).toBe('org-A');expect(next.get('project')).toBe('project-A');expect(next.get('marker')).toBe('keep');
  });
  it.each(['days=999', 'days=7&days=90', 'days=0', 'days='])('recovers an unsupported or ambiguous report window (%s)', query => {
    expect(parseReportView(new URLSearchParams(query))).toEqual({ value: { windowDays: 30 }, invalid: ['days'] });
  });
});
