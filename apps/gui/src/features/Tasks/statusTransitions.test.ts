import { describe, it, expect } from 'vitest';
import { allowedStatuses } from './statusTransitions';

const statuses = [
  { id: 's-open', name: 'open', position: 0 },
  { id: 's-review', name: 'review', position: 1 },
  { id: 's-done', name: 'done', position: 2 },
];

/**
 * M32-T05: the status pickers offered every status of the type while the
 * server (tasks.handler.ts validateStatusForTaskType) refused moves that are
 * not an edge - so a user could pick something that could only fail. This is
 * the same rule, client side.
 */
describe('allowedStatuses', () => {
  it('is unrestricted for an untyped task or a type with no statuses', () => {
    expect(allowedStatuses(undefined, 'todo')).toBeNull();
    expect(allowedStatuses({ statuses: [], transitions: [] }, 'todo')).toBeNull();
  });

  it('allows every status of the type when no transitions are configured', () => {
    expect(allowedStatuses({ statuses, transitions: [] }, 'open')).toEqual(['open', 'review', 'done']);
  });

  it('allows the current status and its outgoing edges, in pipeline order', () => {
    const transitions = [
      { fromStatusId: 's-open', toStatusId: 's-review' },
      { fromStatusId: 's-review', toStatusId: 's-done' },
      { fromStatusId: 's-review', toStatusId: 's-open' },
    ];
    expect(allowedStatuses({ statuses, transitions }, 'open')).toEqual(['open', 'review']);
    expect(allowedStatuses({ statuses, transitions }, 'review')).toEqual(['open', 'review', 'done']);
    expect(allowedStatuses({ statuses, transitions }, 'done')).toEqual(['done']);
  });

  it("allows moving into the pipeline from a status it does not know", () => {
    // The server allows this too: the status predates the type's state machine.
    const transitions = [{ fromStatusId: 's-open', toStatusId: 's-review' }];
    expect(allowedStatuses({ statuses, transitions }, 'legacy')).toEqual(['open', 'review', 'done']);
  });
});
