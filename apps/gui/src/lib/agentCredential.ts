import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { AuthService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { BACKEND_URL } from './backendUrl';

interface WorkerScope { endpoint: string; orgId: string; projectId?: string; }
export function workerConfiguration(format: 'shell' | 'mcp', scope: WorkerScope, secret: string): string {
  const env: { TASKER_BACKEND_URL: string; TASKER_ORG_ID: string; TASKER_TOKEN: string; TASKER_PROJECT_ID?: string } = {
    TASKER_BACKEND_URL: scope.endpoint, TASKER_ORG_ID: scope.orgId, TASKER_TOKEN: secret,
  };
  if (scope.projectId) env.TASKER_PROJECT_ID = scope.projectId;
  if (format === 'mcp') return JSON.stringify({ mcpServers: { tasker: { command: 'tasker', args: ['mcp'], env } } }, null, 2);
  const quote = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;
  return Object.entries(env).map(([key, value]) => `export ${key}=${quote(value)}`).join('\n') + '\ntasker auth whoami';
}

export interface IssuedIdentity { agentId: string; orgId: string; tokenId: string; scopes: string[]; }
export async function verifyAgentCredential(secret: string, expected: IssuedIdentity, signal: AbortSignal) {
  // Intentionally separate from the GUI transport: no cookie, logging, retry or
  // error reporter can substitute the operator's session or retain raw errors.
  const client = createClient(AuthService, createConnectTransport({ baseUrl: BACKEND_URL,
    fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'omit', redirect: 'error' }),
  }));
  let response;
  try {
    response = await client.getIdentity({}, { headers: { Authorization: `Bearer ${secret}` }, signal });
  } catch (error) {
    if (signal.aborted) throw new Error('Verification canceled.');
    if (error instanceof ConnectError && (error.code === Code.Unauthenticated || error.code === Code.PermissionDenied)) throw new Error('Token refused. It may be expired or revoked.');
    throw new Error('Could not reach the API. Check connectivity and retry.');
  }
  if (signal.aborted) throw new Error('Verification canceled.');
  const agent = response.agent;
  const sameScopes = agent && agent.scopes.length === expected.scopes.length && [...agent.scopes].sort().every((scope, index) => scope === [...expected.scopes].sort()[index]);
  if (response.user || !agent || agent.id !== expected.agentId || agent.orgId !== expected.orgId || agent.tokenId !== expected.tokenId || !sameScopes) throw new Error('The API returned a different identity.');
  return { agentId: agent.id, name: agent.name, orgId: agent.orgId, scopes: [...agent.scopes], verifiedAt: new Date().toISOString() };
}
