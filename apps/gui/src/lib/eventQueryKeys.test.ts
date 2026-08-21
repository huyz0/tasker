import { describe, it, expect } from 'vitest';
import { queryKeysForSubject, isControlFrame } from './eventQueryKeys';

const roots = (subject: string) => queryKeysForSubject(subject)?.map(([k]) => k);

describe('queryKeysForSubject', () => {
  it('invalidates only what a task event touches', () => {
    // The whole point of the feed is to stop refetching everything. A task
    // changing must not re-run artifacts, teams and the memory screen.
    expect(roots('domain.task.created')).toEqual(['tasks', 'task', 'dashboard', 'auditEvents']);
  });

  it('treats every action on an entity the same way', () => {
    // created/updated/archived/restored/purged all mean "the list you hold is
    // wrong", so the map is keyed on the entity, not the 80 full subjects.
    for (const action of ['created', 'updated', 'deleted', 'restored', 'purged']) {
      expect(roots(`domain.task.${action}`)).toEqual(roots('domain.task.created'));
    }
  });

  it('routes a note to the handoff and task queries, not the board', () => {
    expect(roots('domain.tasknote.created')).toEqual(['handoffNotes', 'task', 'auditEvents']);
  });

  it('maps the status-vocabulary entities onto the task-type queries that hold them', () => {
    // Statuses and transitions have no queries of their own — they are read as
    // part of a task type.
    for (const entity of ['task_status', 'task_status_transition', 'task_statuses', 'task_type']) {
      expect(roots(`domain.${entity}.created`)).toEqual(['taskTypes', 'taskType', 'auditEvents']);
    }
  });

  it('refreshes the artifact list when a folder changes, since folders scope it', () => {
    expect(roots('domain.folder.updated')).toContain('artifacts');
  });

  it('drops everything only for the two events whose blast radius really is everything', () => {
    // A retention sweep hard-deletes rows anywhere; purging an org removes the
    // whole tenant. Anything narrower would leave stale rows on screen.
    expect(queryKeysForSubject('domain.retention.swept')).toBeNull();
    expect(queryKeysForSubject('domain.org.purged')).toBeNull();
  });

  it('narrows an unknown entity to the audit trail rather than dropping everything', () => {
    // A backend publisher landing before this map knows about it should cost a
    // missed refresh, not a cache stampede on every event it emits.
    expect(roots('domain.somethingnew.created')).toEqual(['auditEvents']);
  });

  it('invalidates the audit trail for every domain event, because it records them all', () => {
    for (const subject of ['domain.task.created', 'domain.agent.created', 'domain.belief.recorded']) {
      expect(roots(subject)).toContain('auditEvents');
    }
  });

  it('invalidates nothing for a control frame', () => {
    expect(queryKeysForSubject('stream.ready')).toEqual([]);
    expect(queryKeysForSubject('stream.heartbeat')).toEqual([]);
  });
});

describe('isControlFrame', () => {
  it('separates stream bookkeeping from domain traffic', () => {
    expect(isControlFrame('stream.ready')).toBe(true);
    expect(isControlFrame('stream.heartbeat')).toBe(true);
    expect(isControlFrame('domain.task.created')).toBe(false);
  });
});
