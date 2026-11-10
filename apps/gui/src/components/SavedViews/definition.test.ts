import { describe, expect, it } from 'vitest';
import { create } from '@bufbuild/protobuf';
import { SavedViewDefinitionSchema, SavedViewMetadataSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { definitionFromUrl, locationFromSavedView } from './definition';
const metadata = () => create(SavedViewMetadataSchema, { id: 'view-1', orgId: 'o1', projectId: 'p2', ownerUserId: 'u1', screen: 'tasks', visibility: 'personal' });
const location = { pathname: '/tasks/task-1', search: '?org=o1&project=p1&q=old&view=table&priority=4&ready=1&sort=title:desc&extra=kept', hash: '#context' };
describe('saved query URL boundary', () => {
  it('captures only supported URL settings and preserves absent priority versus zero', () => {
    expect(definitionFromUrl('tasks', '?q=release&priority=0&ready=0&sort=createdAt:asc&view=table&cursor=private').tasks).toMatchObject({ search: 'release', priority: 0, ready: false, viewMode: 'table', sort: 'createdAt:asc' });
    expect(definitionFromUrl('tasks', '').tasks?.priority).toBeUndefined();
    expect(JSON.stringify(definitionFromUrl('reports', '?days=90&q=ignored'))).not.toContain('ignored');
    expect(definitionFromUrl('reports', '?days=90').reports?.windowDays).toBe(90);
  });
  it('applies the complete supported definition and fresh project in one location, preserving unrelated params', () => {
    const saved = create(SavedViewDefinitionSchema, { version: 1, screen: 'tasks', tasks: { priority: 0, ready: false } });
    const next = locationFromSavedView(location, metadata(), saved, 'tasks', 'o1', 'u1');
    expect(next.pathname).toBe('/tasks');expect(next.hash).toBe('#context');
    const params = new URLSearchParams(next.search);
    expect(Object.fromEntries(params)).toEqual({ org: 'o1', project: 'p2', priority: '0', extra: 'kept' });
  });
  it('uses the report window without importing task filters into the definition', () => {
    const next = locationFromSavedView({ pathname: '/reports', search: '?org=o1&project=p1&days=7', hash: '' }, { ...metadata(), screen: 'reports' }, create(SavedViewDefinitionSchema, { version: 1, screen: 'reports', reports: { windowDays: 90 } }), 'reports', 'o1', 'u1');
    expect(new URLSearchParams(next.search).get('days')).toBe('90');expect(next.pathname).toBe('/reports');
  });
  it.each([
    { version: 2, screen: 'tasks', tasks: {} },
    { version: 1, screen: 'reports', reports: { windowDays: 90 } },
    { version: 1, screen: 'tasks', tasks: { priority: 8 } },
    { version: 1, screen: 'tasks', tasks: { viewMode: 'grid' } },
    { version: 1, screen: 'tasks', tasks: { sort: 'owner:asc' } },
    { version: 1, screen: 'tasks', tasks: {}, reports: {} },
  ])('refuses an unsupported fresh definition without producing a navigation: %j', definition => {
    expect(() => locationFromSavedView(location, metadata(), create(SavedViewDefinitionSchema, definition), 'tasks', 'o1', 'u1')).toThrow();
  });
  it('refuses response metadata from another tenant, person, screen or absent project', () => {
    const definition = create(SavedViewDefinitionSchema, { version: 1, screen: 'tasks', tasks: {} });
    for (const changed of [{ orgId: 'o2' }, { ownerUserId: 'u2' }, { screen: 'reports' }, { projectId: '' }]) expect(() => locationFromSavedView(location, { ...metadata(), ...changed }, definition, 'tasks', 'o1', 'u1')).toThrow();
  });
});


it('keeps report defaults and refuses unsupported or contradictory fresh report queries', () => {
  const view = { ...metadata(), screen: 'reports' };
  const initial = { pathname: '/reports', search: '?org=o1&project=p1&days=7', hash: '' };
  const next = locationFromSavedView(initial, view, create(SavedViewDefinitionSchema, { version: 1, screen: 'reports', reports: {} }), 'reports', 'o1', 'u1');
  expect(new URLSearchParams(next.search).has('days')).toBe(false);
  for (const invalid of [{ version: 1, screen: 'reports' }, { version: 1, screen: 'reports', reports: { windowDays: 14 } }, { version: 1, screen: 'reports', reports: {}, tasks: {} }]) expect(() => locationFromSavedView(initial, view, create(SavedViewDefinitionSchema, invalid), 'reports', 'o1', 'u1')).toThrow();
});
