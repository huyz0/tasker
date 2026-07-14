import { describe, it, expect, beforeEach } from 'bun:test';
import { recordBusinessEvent, getBusinessEventCounts, resetBusinessEvents } from './businessEvents';

beforeEach(() => {
  resetBusinessEvents();
});

describe('businessEvents', () => {
  it('starts with no recorded events', () => {
    expect(getBusinessEventCounts()).toEqual({});
  });

  it('increments the count for a repeated event', () => {
    recordBusinessEvent('domain.task.created');
    recordBusinessEvent('domain.task.created');
    recordBusinessEvent('domain.task.created');
    expect(getBusinessEventCounts()['domain.task.created']).toBe(3);
  });

  it('tracks distinct events independently', () => {
    recordBusinessEvent('domain.task.created');
    recordBusinessEvent('domain.project.created');
    expect(getBusinessEventCounts()).toEqual({
      'domain.task.created': 1,
      'domain.project.created': 1,
    });
  });

  it('sorts counts descending', () => {
    recordBusinessEvent('domain.rare.event');
    recordBusinessEvent('domain.common.event');
    recordBusinessEvent('domain.common.event');
    recordBusinessEvent('domain.common.event');
    expect(Object.keys(getBusinessEventCounts())).toEqual(['domain.common.event', 'domain.rare.event']);
  });

  it('resetBusinessEvents clears all recorded counts', () => {
    recordBusinessEvent('domain.task.created');
    resetBusinessEvents();
    expect(getBusinessEventCounts()).toEqual({});
  });
});
