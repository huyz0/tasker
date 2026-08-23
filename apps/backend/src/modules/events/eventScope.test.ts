import { describe, it, expect } from 'bun:test';
import { shouldDeliver, invalidatesScope, toEnvelope } from './eventScope';

const scope = (orgs: string[], over: Record<string, any> = {}) => ({
  authorizedOrgIds: new Set(orgs),
  ...over,
});

describe('shouldDeliver', () => {
  it('delivers an event for an org the subscriber belongs to', () => {
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-1' }, scope(['org-1']))).toBe(true);
  });

  it("never delivers another org's event, whatever the client asked for", () => {
    // The rule that matters most: this feed carries who-did-what across a
    // tenant boundary if it is wrong.
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-2' }, scope(['org-1']))).toBe(false);
    expect(
      shouldDeliver({ subject: 'domain.task.created', orgId: 'org-2' }, scope(['org-1'], { requestedOrgId: 'org-2' })),
    ).toBe(false);
  });

  it('never delivers an event that names no org', () => {
    // A user registering precedes any membership, so there is nobody it can
    // safely go to. The audit trail still records it.
    expect(shouldDeliver({ subject: 'domain.auth.registered', orgId: null }, scope(['org-1']))).toBe(false);
  });

  it("applies the client's org narrowing underneath membership", () => {
    const s = scope(['org-1', 'org-2'], { requestedOrgId: 'org-1' });
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-1' }, s)).toBe(true);
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-2' }, s)).toBe(false);
  });

  it('applies project narrowing so a board only wakes for its own project', () => {
    const s = scope(['org-1'], { requestedProjectId: 'proj-1' });
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-1', projectId: 'proj-1' }, s)).toBe(true);
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-1', projectId: 'proj-2' }, s)).toBe(false);
  });

  it('withholds an org-level event from a project-narrowed subscription', () => {
    // Asking for one project's feed and receiving org-wide events would make
    // the narrowing a lie; a client that wants both subscribes twice.
    const s = scope(['org-1'], { requestedProjectId: 'proj-1' });
    expect(shouldDeliver({ subject: 'domain.org.renamed', orgId: 'org-1', projectId: null }, s)).toBe(false);
  });

  it('delivers nothing at all to a subscriber with no memberships', () => {
    expect(shouldDeliver({ subject: 'domain.task.created', orgId: 'org-1' }, scope([]))).toBe(false);
  });
});

describe('invalidatesScope', () => {
  it('flags the events that can change who belongs to what', () => {
    // Without this, a connection authorized once at connect keeps streaming
    // an org's events to someone removed from it minutes ago.
    for (const subject of [
      'domain.org.created',
      'domain.org.member_added',
      'domain.org.member_removed',
      'domain.org.member_role_updated',
      'domain.org.archived',
      'domain.org.purged',
    ]) {
      expect(invalidatesScope({ subject, orgId: 'org-1' })).toBe(true);
    }
  });

  it('does not re-resolve on ordinary traffic', () => {
    // Re-resolving on every event would put a membership query in front of
    // the whole feed, which is what watching the stream avoids.
    expect(invalidatesScope({ subject: 'domain.task.created', orgId: 'org-1' })).toBe(false);
    expect(invalidatesScope({ subject: 'domain.artifact.updated', orgId: 'org-1' })).toBe(false);
  });
});

describe('toEnvelope', () => {
  it('pulls out the routing fields a subscriber needs', () => {
    expect(toEnvelope('domain.task.created', { orgId: 'org-1', projectId: 'proj-1', title: 'x' })).toEqual({
      subject: 'domain.task.created',
      orgId: 'org-1',
      projectId: 'proj-1',
    });
  });

  it('treats a missing org as null rather than inventing one', () => {
    expect(toEnvelope('domain.auth.registered', { userId: 'u1' })).toEqual({
      subject: 'domain.auth.registered',
      orgId: null,
      projectId: null,
    });
  });

  it('ignores non-string ids instead of coercing them', () => {
    // A number where an id belongs is a malformed event, and coercing it
    // would let `123` match an org named "123".
    expect(toEnvelope('domain.task.created', { orgId: 123 })?.orgId).toBeNull();
  });

  it('returns null for a payload that is not an object', () => {
    expect(toEnvelope('domain.task.created', 'nope')).toBeNull();
    expect(toEnvelope('domain.task.created', null)).toBeNull();
  });
});

// ── M26-T02 (ADR-0023): per-subject filtering for agent principals ──────────
//
// The governing rule: an agent may see an event only where its scopes would
// have permitted the equivalent read through an ordinary RPC. A human
// session is unaffected — `agentScopes` is absent and nothing is filtered.

describe('agent scope filtering (M26-T02)', () => {
  const orgs = new Set(['org-1']);
  const deliver = (subject: string, scopes?: string[]) =>
    shouldDeliver(
      { subject, orgId: 'org-1', projectId: 'proj-1' },
      { authorizedOrgIds: orgs, ...(scopes ? { agentScopes: new Set(scopes) } : {}) },
    );

  it('does not filter a human subscriber — no agentScopes, nothing dropped', () => {
    expect(deliver('domain.task.created')).toBe(true);
    expect(deliver('domain.org.member_added')).toBe(true);
    expect(deliver('domain.agent.token_created')).toBe(true);
  });

  it('delivers a subject the token could have read through an RPC', () => {
    expect(deliver('domain.task.created', ['tasks:read'])).toBe(true);
    expect(deliver('domain.artifact.created', ['artifacts:read'])).toBe(true);
    expect(deliver('domain.belief.recorded', ['memory:read'])).toBe(true);
  });

  it('drops a subject the token could not have read', () => {
    expect(deliver('domain.task.created', ['agents:read'])).toBe(false);
    expect(deliver('domain.artifact.created', ['tasks:read'])).toBe(false);
    expect(deliver('domain.belief.recorded', ['tasks:read'])).toBe(false);
  });

  it('mirrors the read path: comments and notes ride tasks:read, as listComments does', () => {
    expect(deliver('domain.comment.created', ['tasks:read'])).toBe(true);
    expect(deliver('domain.tasknote.created', ['tasks:read'])).toBe(true);
    // comments:write is the *write* scope; it grants no reads anywhere else
    // either, so it must not open the feed on its own.
    expect(deliver('domain.comment.created', ['comments:write'])).toBe(false);
  });

  it('never delivers administration families — no agent read scope exists for them', () => {
    for (const subject of [
      'domain.org.member_added',
      'domain.team.created',
      'domain.role.updated',
      'domain.grant.created',
      'domain.retention.swept',
    ]) {
      // Not even with every scope an agent can hold.
      expect(deliver(subject, [
        'tasks:read', 'tasks:write', 'comments:write', 'artifacts:read',
        'artifacts:write', 'projects:read', 'agents:read', 'repos:read',
        'memory:read', 'memory:write', 'events:read',
      ])).toBe(false);
    }
  });

  it('never delivers token issuance, even to agents:read', () => {
    // listAgentTokens is categorically absent from AGENT_RPC_SCOPES, so the
    // feed must not grant through the back door what the request path
    // refuses at the front (ADR-0023).
    expect(deliver('domain.agent.token_created', ['agents:read'])).toBe(false);
    expect(deliver('domain.agent.token_revoked', ['agents:read'])).toBe(false);
    // The rest of the agent family is still readable.
    expect(deliver('domain.agent.created', ['agents:read'])).toBe(true);
  });

  it('drops an unknown subject family rather than defaulting it open', () => {
    expect(deliver('domain.something_new.created', ['tasks:read'])).toBe(false);
  });

  it('still applies the org and project rules underneath', () => {
    expect(shouldDeliver(
      { subject: 'domain.task.created', orgId: 'other-org', projectId: 'p' },
      { authorizedOrgIds: orgs, agentScopes: new Set(['tasks:read']) },
    )).toBe(false);
  });
});
