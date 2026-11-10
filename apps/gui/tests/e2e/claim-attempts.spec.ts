import { test, expect } from '@playwright/test';
import { createClient, Code } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { fromJson, type DescMessage, type JsonValue, type MessageShape } from '@bufbuild/protobuf';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentService, ArtifactService, AuthService, OrgService, ProjectService, ProjectTemplateService, TaskNoteService, TaskService,
  ClaimTaskResponseSchema, CreateTaskNoteResponseSchema, ReleaseTaskResponseSchema, ReportUsageResponseSchema, LinkTaskArtifactResponseSchema,
} from 'shared-contract/gen/ts/tasker/health/v1/health_pb.ts';

const api = process.env.TASKER_E2E_BACKEND_URL ?? 'http://localhost:8080';
// Credentials never enter the browser DOM, traces, video or failure artifacts.
test.use({ trace: 'off', video: 'off', screenshot: 'off', viewport: { width: 375, height: 1000 } });
function transport(headers: Record<string, string>) {
  return createConnectTransport({ baseUrl: api, defaultTimeoutMs: 15_000, interceptors: [next => async request => {
    for (const [name, value] of Object.entries(headers)) request.header.set(name, value);
    return next(request);
  }] });
}
async function mcp<D extends DescMessage>(secret: string, name: string, args: object, schema: D): Promise<MessageShape<D>> {
  try {
    const response = await fetch(`${api}/mcp`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: {
      'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${secret}`,
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    if (!response.ok) throw new Error();
    const reply = await response.json() as { result?: { structuredContent?: JsonValue; isError?: boolean }; error?: object };
    if (reply.error || reply.result?.isError || reply.result?.structuredContent === undefined) throw new Error();
    return fromJson(schema, reply.result.structuredContent);
  } catch { throw new Error('Owned MCP worker operation failed.'); }
}
function cli<D extends DescMessage>(secret: string, orgId: string, projectId: string, args: string[], schema: D): MessageShape<D> {
  const binary = process.env.TASKER_CLAIM_CLI_BINARY;
  if (!binary) throw new Error('Explicit CLI proof needs its compiled binary.');
  const dir = mkdtempSync(join(tmpdir(), 'tasker-claim-cli-'));
  try {
    const credentials = join(dir, 'must-not-exist.json');
    const childEnv: NodeJS.ProcessEnv = { ...process.env, TASKER_TOKEN: secret, TASKER_BACKEND_URL: api,
      TASKER_ORG_ID: orgId, TASKER_PROJECT_ID: projectId, TASKER_CREDENTIALS_PATH: credentials };
    delete childEnv.TASKER_DEBUG;
    const result = spawnSync(binary, args, { env: childEnv, encoding: 'utf8', timeout: 15_000 });
    if (result.status !== 0 || existsSync(credentials)) throw new Error('Owned CLI worker operation failed.');
    try { return fromJson(schema, JSON.parse(result.stdout)); }
    catch { throw new Error('Owned CLI response did not match the generated contract.'); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const nextRecordedSecond = () => new Promise(resolve => setTimeout(resolve, 1050 - Date.now() % 1000));

test('groups real worker receipts and delayed reports, fences old releases and reconciles eventless ownership on an older page', async ({ page, context }) => {
  test.setTimeout(150_000);
  const login = await context.request.get(`${api}/api/auth/test/inject?userId=dev-user`);
  if (!login.ok()) throw new Error('Owned browser session setup failed.');
  const cookie = (await context.cookies(api)).map(value => `${value.name}=${value.value}`).join('; ');
  if (!cookie) throw new Error('Owned browser session was not issued.');
  const human = transport({ cookie }), agents = createClient(AgentService, human), tasks = createClient(TaskService, human);
  const artifacts = createClient(ArtifactService, human);
  const owned: { agentId: string; name: string; tokenId: string }[] = [];
  try {
    const userId = (await createClient(AuthService, human).getIdentity({})).user?.id;
    if (!userId) throw new Error('Owned human principal was not confirmed.');
    const stamp = crypto.randomUUID();
    const org = (await createClient(OrgService, human).seedOrg({ name: 'Receipt browser proof', slug: `claim-browser-${stamp}` })).organization!;
    const template = (await createClient(ProjectTemplateService, human).createTemplate({ orgId: org.id, name: 'Receipt browser template' })).template!;
    const project = (await createClient(ProjectService, human).createProject({ orgId: org.id, templateId: template.id, ownerId: userId, name: 'Receipt browser project' })).project!;
    const task = (await tasks.createTask({ projectId: project.id, title: `Review worker receipts ${stamp}`, status: 'todo' })).task!;
    const role = (await agents.createAgentRole({ orgId: org.id, name: 'Receipt browser worker', systemPrompt: 'Record only authorized work.', capabilities: '[]' })).role!;
    const issue = async (name: string) => {
      const agent = (await agents.createAgent({ orgId: org.id, agentRoleId: role.id, name })).agent!;
      const metadata = { agentId: agent.id, name: `claim-browser-owned-${crypto.randomUUID()}`, tokenId: '' };owned.push(metadata);
      const issued = await agents.createAgentToken({ agentId: agent.id, name: metadata.name,
        scopes: ['tasks:read', 'tasks:write', 'comments:write', 'artifacts:read', 'artifacts:write'] });
      metadata.tokenId = issued.token?.id ?? '';
      if (!metadata.tokenId || !issued.plaintext) throw new Error('Owned worker credential was not issued.');
      return { agent, secret: issued.plaintext, tasks: createClient(TaskService, transport({ authorization: `Bearer ${issued.plaintext}` })) };
    };
    const a = await issue('Prior browser worker'), b = await issue('Current browser worker');
    const folder = (await artifacts.createFolder({ projectId: project.id, name: 'Receipt outputs' })).folder!;
    const priorArtifact = (await artifacts.createArtifact({ folderId: folder.id, name: 'receipt-prior.md', contentType: 'text/markdown', content: '# Recorded prior output' })).artifact!;
    const legacyArtifact = (await artifacts.createArtifact({ folderId: folder.id, name: 'receipt-legacy.md', contentType: 'text/markdown', content: '# Ungrouped output' })).artifact!;
    // Make Older/Newer and current-page-only refresh meaningful on the real server.
    for (let index = 0; index < 20; index++) {
      const claim = await a.tasks.claimTask({ taskId: task.id });
      await a.tasks.releaseTask({ taskId: task.id, expectedAttemptId: claim.attempt!.id });
    }
    await nextRecordedSecond();
    const key = `browser-claim-${crypto.randomUUID()}`;
    const first = process.env.TASKER_CLAIM_CLI_BINARY
      ? cli(a.secret, org.id, project.id, ['tasks', 'claim', task.id, '--idempotency-key', key, '--external-run-id', 'pipeline/prior', '--json'], ClaimTaskResponseSchema)
      : await mcp(a.secret, 'claim_task', { task_id: task.id, idempotency_key: key, external_run_id: 'pipeline/prior' }, ClaimTaskResponseSchema);
    if (!first.attempt?.id) throw new Error('Owned claim receipt was not returned.');
    expect((await a.tasks.claimTask({ taskId: task.id, idempotencyKey: key, externalRunId: 'pipeline/prior' })).attempt?.id).toBe(first.attempt.id);
    const explicitText = 'Explicit report for a released claim';
    if (process.env.TASKER_CLAIM_CLI_BINARY) {
      cli(a.secret, org.id, project.id, ['tasks', 'note-add', task.id, '--content', explicitText, '--attempt-id', first.attempt.id, '--json'], CreateTaskNoteResponseSchema);
      cli(a.secret, org.id, project.id, ['tasks', 'release', task.id, '--expected-attempt-id', first.attempt.id, '--handoff', 'Ownership released with context', '--json'], ReleaseTaskResponseSchema);
    } else {
      await mcp(a.secret, 'add_task_note', { task_id: task.id, content: explicitText, attempt_id: first.attempt.id }, CreateTaskNoteResponseSchema);
      await mcp(a.secret, 'release_task', { task_id: task.id, expected_attempt_id: first.attempt.id, handoff_note: 'Ownership released with context' }, ReleaseTaskResponseSchema);
    }
    const second = await a.tasks.claimTask({ taskId: task.id });
    await expect(a.tasks.releaseTask({ taskId: task.id, expectedAttemptId: first.attempt.id, handoffNote: 'Stale release must not write' }))
      .rejects.toMatchObject({ code: Code.FailedPrecondition });
    await a.tasks.releaseTask({ taskId: task.id, expectedAttemptId: second.attempt!.id });
    await nextRecordedSecond();
    const current = await mcp(b.secret, 'claim_task', { task_id: task.id, external_run_id: 'pipeline/current' }, ClaimTaskResponseSchema);
    const delayed = await mcp(a.secret, 'report_usage', { task_id: task.id, attempt_id: first.attempt.id, input_tokens: 100, idempotency_key: 'browser-delayed' }, ReportUsageResponseSchema);
    expect(delayed.record?.attemptId).toBe(first.attempt.id);
    await mcp(a.secret, 'link_task_artifact', { task_id: task.id, artifact_id: priorArtifact.id, attempt_id: first.attempt.id }, LinkTaskArtifactResponseSchema);
    const notesA = createClient(TaskNoteService, transport({ authorization: `Bearer ${a.secret}` }));
    await notesA.createTaskNote({ taskId: task.id, content: 'Legacy report without a claim receipt' });
    await a.tasks.reportUsage({ taskId: task.id, inputTokens: 2n });
    await createClient(ArtifactService, transport({ authorization: `Bearer ${a.secret}` })).linkTaskArtifact({ taskId: task.id, artifactId: legacyArtifact.id });
    await expect(b.tasks.reportUsage({ taskId: task.id, attemptId: first.attempt.id, inputTokens: 1n })).rejects.toMatchObject({ code: Code.NotFound });
    expect(current.attempt?.id).toBeTruthy();
    const cursors: string[] = [];let taskReads = 0;
    page.on('request', request => {
      if (request.url().endsWith('/ListTaskAttempts')) cursors.push((request.postDataJSON() as { page?: { cursor?: string } }).page?.cursor ?? '');
      if (request.url().endsWith('/GetTask')) taskReads++;
    });
    await page.goto(`/tasks/${task.id}?org=${org.id}&project=${project.id}`);
    const detail = page.getByRole('dialog', { name: 'Task Details' });
    await detail.getByText('Summary', { exact: true }).click();
    await detail.getByRole('button', { name: 'Write a summary', exact: true }).click();
    const editor = detail.getByRole('textbox', { name: 'Summary', exact: true });await editor.fill('Keep this unsaved summary across background ownership refresh.');
    await detail.getByText('Claim history', { exact: true }).click();
    const claims = detail.getByRole('list', { name: 'Recorded claims' });
    const prior = claims.getByRole('listitem').filter({ hasText: first.attempt.id });
    await prior.getByRole('button', { name: 'Show associated reports', exact: true }).click();
    await expect(detail.getByRole('link', { name: 'receipt-prior.md', exact: true })).toBeVisible();
    const notes = detail.getByRole('region', { name: 'Agent notes', exact: true });
    await expect(notes.getByText(explicitText, { exact: true })).toBeVisible();
    await expect(notes.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(notes.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await detail.getByText('Usage records', { exact: true }).click();
    await expect(detail.getByRole('list', { name: 'Recorded usage reports' })).toContainText('100 input');
    await expect(detail.getByRole('link', { name: 'receipt-legacy.md', exact: true })).toHaveCount(0);
    await detail.getByRole('combobox', { name: 'Report scope', exact: true }).selectOption('uncorrelated');
    await expect(detail.getByRole('link', { name: 'receipt-legacy.md', exact: true })).toBeVisible();
    await expect(notes.getByText('Legacy report without a claim receipt', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Older claims', exact: true }).click();
    await expect(detail.getByText('Page 2 · 3 shown · 23 recorded', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Refresh claim history', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Refresh claim history', exact: true })).toBeEnabled();
    const before = cursors.length, taskBefore = taskReads, olderCursor = cursors.at(-1);
    expect(Boolean(olderCursor)).toBe(true);await editor.focus();
    // UnassignTask intentionally emits no task event. Only the current visible
    // history page and canonical task read may reconcile this remote mutation.
    await tasks.unassignTask({ taskId: task.id, agentId: b.agent.id });
    await page.waitForTimeout(2000);expect(cursors).toHaveLength(before);
    await expect(detail.getByRole('button', { name: 'Unassigned — assign this task', exact: true })).toBeVisible({ timeout: 35_000 });
    expect(taskReads).toBeGreaterThan(taskBefore);
    expect(cursors.slice(before)).toEqual([olderCursor]);
    await expect(editor).toHaveValue('Keep this unsaved summary across background ownership refresh.');
    await expect(editor).toBeFocused();
    await expect(detail.getByText('Page 2 · 3 shown · 23 recorded', { exact: true })).toBeVisible();
    expect((await tasks.listTaskAttempts({ taskId: task.id })).attempts.find(receipt => receipt.id === current.attempt?.id)?.releaseReason).toBe('unassigned');
  } finally {
    const cleanup = await Promise.allSettled(owned.map(async entry => {
      let ids = entry.tokenId ? [entry.tokenId] : [];
      for (let attempt = 0; !ids.length && attempt < 10; attempt++) {
        ids = (await agents.listAgentTokens({ agentId: entry.agentId })).tokens.filter(token => token.name === entry.name && !token.revokedAt).map(token => token.id);
        if (!ids.length) await new Promise(resolve => setTimeout(resolve, 50));
      }
      for (const tokenId of ids) await agents.revokeAgentToken({ tokenId });
    }));
    await page.goto('about:blank').catch(() => undefined);
    if (cleanup.some(result => result.status === 'rejected')) throw new Error('Owned worker credential cleanup failed.');
  }
});
