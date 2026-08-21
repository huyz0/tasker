import { describe, it, expect } from 'bun:test';
import { ATTR, spanAttributesFor, connectErrorCode } from './tracingInterceptor';

describe('spanAttributesFor', () => {
  it('always names the method being served', () => {
    expect(spanAttributesFor({ service: 'TaskService', method: 'CreateTask' })).toEqual({
      [ATTR.system]: 'connect_rpc',
      [ATTR.service]: 'TaskService',
      [ATTR.method]: 'CreateTask',
    });
  });

  it('adds the caller and the tenant once they are known', () => {
    // Resolved by interceptors that run *inside* this span, so they are set on
    // the way out rather than when it opens.
    const attrs = spanAttributesFor({
      service: 'TaskService',
      method: 'CreateTask',
      principal: { kind: 'agent' },
      orgId: 'org-1',
      requestId: 'req-1',
    });

    expect(attrs[ATTR.principalKind]).toBe('agent');
    expect(attrs[ATTR.orgId]).toBe('org-1');
    expect(attrs[ATTR.requestId]).toBe('req-1');
  });

  it('omits what it does not know rather than emitting empty facets', () => {
    // An attribute present on every span with an empty value is a facet that
    // groups everything together and answers nothing.
    const attrs = spanAttributesFor({ service: 'S', method: 'M', principal: null });
    expect(ATTR.principalKind in attrs).toBe(false);
    expect(ATTR.orgId in attrs).toBe(false);
  });

  it('carries no payload, only identities', () => {
    // A span holding task titles or artifact content is a copy of the database
    // living in a system with different access rules.
    const attrs = spanAttributesFor({ service: 'S', method: 'M', orgId: 'org-1' });
    for (const value of Object.values(attrs)) {
      expect(typeof value).toBe('string');
    }
    expect(Object.keys(attrs).every((k) => k.startsWith('rpc.') || k.startsWith('tasker.'))).toBe(true);
  });
});

describe('connectErrorCode', () => {
  it("reads a ConnectError's code, which is what a trace filters on", () => {
    expect(connectErrorCode({ code: 'permission_denied' })).toBe('permission_denied');
  });

  it('has nothing to say about an ordinary error', () => {
    // A thrown TypeError has no `code`, and inventing one would make
    // "permission_denied" and "a bug" indistinguishable in a dashboard.
    expect(connectErrorCode(new Error('boom'))).toBeUndefined();
    expect(connectErrorCode(undefined)).toBeUndefined();
    expect(connectErrorCode('a string')).toBeUndefined();
  });

  it('ignores a numeric code rather than stringifying it', () => {
    // Node's own errors carry numeric `code` values on occasion; those are not
    // Connect codes and must not be labelled as if they were.
    expect(connectErrorCode({ code: 42 })).toBeUndefined();
  });
});
