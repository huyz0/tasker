import { describe, expect, it } from 'bun:test';
import { createToolHost, loopbackCaller } from './tools';
import { handleMcpMessage, JSONRPC } from './protocol';

const mappings = [
  ['list_folders', { project_id: 'project-a' }, 'ListFolders', { projectId: 'project-a', page: { limit: 20 } }],
  ['list_artifacts', { folder_id: 'folder-a', limit: 5, cursor: 'next' }, 'ListArtifacts', { folderId: 'folder-a', page: { limit: 5, cursor: 'next' } }],
  ['create_artifact', { folder_id: 'folder-a', name: 'empty.md', content: '' }, 'CreateArtifact', { folderId: 'folder-a', name: 'empty.md', content: '' }],
  ['link_task_artifact', { task_id: 'task-a', artifact_id: 'artifact-a' }, 'LinkTaskArtifact', { taskId: 'task-a', artifactId: 'artifact-a' }],
  ['list_task_artifact_links', { task_id: 'task-a' }, 'ListTaskArtifactLinks', { taskId: 'task-a', page: { limit: 20 } }],
  ['get_artifact_content', { artifact_id: 'artifact-a' }, 'GetArtifactContent', { artifactId: 'artifact-a', maxCharacters: 4000 }],
] as const;

describe('bounded artifact MCP adapters (M54)', () => {
  it.each(mappings)('%s traverses JSON-RPC and loopback as exactly one existing RPC', async (name, args, method, body) => {
    const sent: { url: string; body: unknown }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });
      return Response.json({ receipt: 'same-rpc-response' });
    }) as typeof fetch;
    const host = createToolHost(loopbackCaller('http://127.0.0.1:8095', 'Bearer fixture-only', fake));
    const response: any = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, host);
    expect(response.error).toBeUndefined();
    expect(response.result.structuredContent).toEqual({ receipt: 'same-rpc-response' });
    expect(sent).toEqual([{ url: `http://127.0.0.1:8095/tasker.health.v1.ArtifactService/${method}`, body }]);
    expect(host.tools.find(tool => tool.name === name)?.annotations?.readOnlyHint).toBe(!['create_artifact', 'link_task_artifact'].includes(name));
  });

  it.each([
    ['get_artifact_content', { artifact_id: 'a', max_characters: null }],
    ['list_folders', { project_id: 'p', limit: null }],
    ['create_artifact', { folder_id: 'f', name: 'a', content: '', description: null }],
    ['get_artifact_content', { artifact_id: 'a', max_characters: 0 }],
    ['get_artifact_content', { artifact_id: 'a', max_characters: 16001 }],
    ['get_artifact_content', { artifact_id: 'a', max_characters: 1.5 }],
    ['get_artifact_content', { artifact_id: '' }],
    ['list_folders', { project_id: 'p', limit: 101 }],
    ['list_task_artifact_links', {}],
    ['list_task_artifact_links', { task_id: 't', artifact_id: 'a' }],
    ['create_artifact', { folder_id: 'f', name: 'a' }],
    ['create_artifact', { folder_id: 'f', name: '', content: '' }],
    ['create_artifact', { folder_id: 'f', name: 'a', content: null }],
    ['create_artifact', { folder_id: 'f', name: 'a', content: 'x'.repeat(16001) }],
    ['link_task_artifact', { task_id: 't', artifact_id: '' }],
  ] as const)('refuses malformed %s arguments before RPC %#', async (name, args) => {
    let calls = 0;
    const host = createToolHost(async () => { calls++; return {}; });
    expect(host.tools.find(tool => tool.name === name)).toBeDefined();
    const response: any = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, host);
    expect(response.error.code).toBe(JSONRPC.invalidParams);
    expect(calls).toBe(0);
  });

  it('honors the maximum read limit and explicit UTF-16 create bound without adding human-only adapters', async () => {
    const sent: unknown[] = [];
    const host = createToolHost(async (_service, method, body) => { sent.push({ method, body }); return {}; });
    await host.call('get_artifact_content', { artifact_id: 'a', max_characters: 16000 });
    const content = '😀'.repeat(8000);
    await host.call('create_artifact', { folder_id: 'f', name: 'a', content, description: 'Stored literal', content_type: 'text/plain' });
    expect(sent).toEqual([
      { method: 'GetArtifactContent', body: { artifactId: 'a', maxCharacters: 16000 } },
      { method: 'CreateArtifact', body: { folderId: 'f', name: 'a', content, description: 'Stored literal', contentType: 'text/plain' } },
    ]);
    expect(host.tools.some(tool => ['create_folder', 'unlink_task_artifact'].includes(tool.name))).toBe(false);
  });
});
