import { describe, expect, it } from 'bun:test';
import { createToolHost, loopbackCaller } from './tools';
import { handleMcpMessage } from './protocol';

describe('MCP explicit claim and report arguments', () => {
  const cases = [
    { name: 'claim_task', args: { task_id: 'task-1' }, argument: 'external_run_id', field: 'externalRunId', value: 'run/42' },
    { name: 'claim_next_task', args: { project_id: 'project-1' }, argument: 'external_run_id', field: 'externalRunId', value: 'run/42' },
    { name: 'release_task', args: { task_id: 'task-1' }, argument: 'expected_attempt_id', field: 'expectedAttemptId', value: 'ta-1' },
    { name: 'add_task_note', args: { task_id: 'task-1', content: 'Result' }, argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
    { name: 'report_usage', args: { task_id: 'task-1', input_tokens: 1 }, argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
    { name: 'link_task_artifact', args: { task_id: 'task-1', artifact_id: 'artifact-1' }, argument: 'attempt_id', field: 'attemptId', value: 'ta-1' },
  ];

  for (const scenario of cases) {
    it(`${scenario.name} sends only explicitly supplied correlation through the caller`, async () => {
      const sent: Record<string, unknown>[] = [];
      const fetcher = (async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string));
        return new Response('{}', { status: 200 });
      }) as typeof fetch;
      const host = createToolHost(loopbackCaller('http://127.0.0.1:8080', 'Bearer fixture-token', fetcher));
      const call = (args: Record<string, unknown>) => handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: scenario.name, arguments: args } }, host) as Promise<any>;
      const explicit = await call({ ...scenario.args, [scenario.argument]: scenario.value });
      expect(explicit.error).toBeUndefined();
      expect(explicit.result.isError).not.toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0]![scenario.field]).toBe(scenario.value);
      sent.length = 0;
      const legacy = await call(scenario.args);
      expect(legacy.error).toBeUndefined();
      expect(sent).toHaveLength(1);
      expect(Object.hasOwn(sent[0]!, scenario.field)).toBe(false);
    });
  }
});
