/**
 * The fixed scope vocabulary from ADR-0008.
 *
 * Closed on purpose. Fine-grained, per-RPC permissions are M10's job, designed
 * against a real policy model; shipping a sprawling vocabulary now would mean
 * either migrating every issued token when M10 lands or carrying two systems.
 *
 * No scope grants organization administration. Org mutations, AuthService and
 * token issuance itself are refused to agent principals categorically rather
 * than by omitting a scope from a token — an agent that could mint tokens or
 * add members would escape every other limit here.
 */
export const AGENT_SCOPES = [
  'tasks:read',
  'tasks:write',
  'comments:write',
  'artifacts:read',
  'artifacts:write',
  'projects:read',
  'agents:read',
  'repos:read',
] as const;

// A type alias and an isAgentScope guard belong here too, but M04-T07 is what
// will need them. knip fails the build on an export nothing imports, which is
// the right trade: they arrive with their first caller.
