import { expect, it } from 'bun:test';
import { createServer } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createClient, ConnectError, Code } from '@connectrpc/connect';
import { TaskService } from 'shared-contract/gen/ts/tasker/health/v1/health_pb';
import { createMeasurementTransport } from '../../scripts/measurement-transport';

type Outcome = { settled: boolean; code: number | null };
async function bounded<T>(promise: Promise<T>, milliseconds: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function stalledEndpoint() {
  let accepted!: (request: { method: string | undefined; path: string | undefined; authorization: string | undefined }) => void;
  const received = new Promise<{ method: string | undefined; path: string | undefined; authorization: string | undefined }>(resolve => { accepted = resolve; });
  const sockets = new Set<Socket>();
  const server = createServer((request, _response) => {
    request.resume();
    accepted({ method: request.method, path: request.url, authorization: request.headers.authorization });
    // Actual HTTP connection and request, intentionally no response.
  });
  server.on('connection', socket => { sockets.add(socket);socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { received, endpoint: 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    async close() { for (const socket of sockets) socket.destroy();await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } };
}
async function observe(scenario: 'deadline' | 'cancellation') {
  const fixture = await stalledEndpoint(), controller = new AbortController();
  const transport = createMeasurementTransport({ endpoint: fixture.endpoint, header: 'authorization', value: 'Bearer fixture-stalled-rpc',
    signal: controller.signal, timeoutMs: scenario === 'deadline' ? 200 : 3000 });
  const request = createClient(TaskService, transport).getTask({ taskId: 'fixture-unanswered-task' })
    .then<Outcome, Outcome>(() => ({ settled: true, code: 0 }), error => ({ settled: true, code: ConnectError.from(error).code }));
  try {
    const received = await bounded(fixture.received.then(value => value), 1000, { method: undefined, path: undefined, authorization: undefined });
    expect(received.method).toBe('POST');
    expect(received.path).toBe('/' + TaskService.typeName + '/GetTask');
    expect(received.authorization).toBe('Bearer fixture-stalled-rpc');
    if (scenario === 'cancellation') controller.abort();
    const outcome = await bounded<Outcome>(request, 1000, { settled: false, code: null });
    console.log(JSON.stringify({ kind: 'measurement-transport-observation', scenario, received: true, ...outcome }));
    expect(outcome).toEqual({ settled: true, code: scenario === 'deadline' ? Code.DeadlineExceeded : Code.Canceled });
  } finally { controller.abort();await fixture.close();await request; }
}
it('settles a real stalled RPC at its configured deadline', () => observe('deadline'), 5000);
it('cancels a real in-flight stalled RPC when the controller aborts', () => observe('cancellation'), 5000);
