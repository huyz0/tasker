import { describe, expect, it } from 'bun:test';
import { createToolHost, loopbackCaller } from './tools';
import { handleMcpMessage } from './protocol';

describe('MCP bounded claim/report reads', () => {
  const scenarios = [
    { name: 'list_task_attempts', method: 'ListTaskAttempts', argument: undefined, field: undefined, value: undefined },
    { name: 'list_task_notes', method: 'ListTaskNotes', argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
    { name: 'list_task_notes', method: 'ListTaskNotes', argument: 'uncorrelated_only', field: 'uncorrelatedOnly', value: true },
    { name: 'list_task_notes', method: 'ListTaskNotes', argument: 'note_type', field: 'noteType', value: 'handoff' },
    { name: 'list_usage_records', method: 'ListUsageRecords', argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
    { name: 'list_usage_records', method: 'ListUsageRecords', argument: 'uncorrelated_only', field: 'uncorrelatedOnly', value: true },
    { name: 'list_task_artifact_links', method: 'ListTaskArtifactLinks', argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
    { name: 'list_task_artifact_links', method: 'ListTaskArtifactLinks', argument: 'uncorrelated_only', field: 'uncorrelatedOnly', value: true },
  ];
  for (const scenario of scenarios) it(`${scenario.name} forwards ${scenario.argument ?? 'history pagination'} and preserves omission`, async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = (async (url: string | URL | Request, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(init.body as string) });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const host = createToolHost(loopbackCaller('http://127.0.0.1:8080', 'Bearer fixture-token', fetcher));
    const call = (args: Record<string, unknown>) => handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: scenario.name, arguments: args } }, host) as Promise<any>;
    const explicit = await call({ task_id: 'task-1', limit: 7, cursor: 'next-page',
      ...(scenario.argument ? { [scenario.argument]: scenario.value } : {}) });
    expect(explicit.error).toBeUndefined(); expect(explicit.result.isError).not.toBe(true);
    expect(calls).toHaveLength(1); expect(calls[0]!.url.endsWith(`/${scenario.method}`)).toBe(true);
    expect(calls[0]!.body).toEqual({ taskId: 'task-1', page: { limit: 7, cursor: 'next-page' },
      ...(scenario.field ? { [scenario.field]: scenario.value } : {}) });
    calls.length = 0;
    const legacy = await call({ task_id: 'task-1' });
    expect(legacy.error).toBeUndefined(); expect(legacy.result.isError).not.toBe(true);
    expect(calls).toHaveLength(1);
    for (const field of ['attemptId', 'uncorrelatedOnly', 'noteType']) expect(Object.hasOwn(calls[0]!.body, field)).toBe(false);
  });
});
