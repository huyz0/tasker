import { expect, type Page } from '@playwright/test';
import { fromBinary, fromJsonString } from '@bufbuild/protobuf';
import { SubscribeEventsRequestSchema } from 'shared-contract/gen/ts/tasker/health/v1/health_pb.ts';

interface FeedConnection {
  id: number;
  orgId?: string;
  projectId?: string;
  open: boolean;
}

declare global {
  interface Window {
    __decodeRecoveryScope(data: number[], contentType: string): Promise<{ orgId?: string; projectId?: string }>;
    __recoveryFeed: {
      autoReady: boolean;
      rejectNew: boolean;
      connections: FeedConnection[];
      send(id: number, subject: string): void;
      drop(id: number): void;
    };
  }
}

/** Intercept only stream transport bytes; all source RPCs remain real. */
export async function controlLiveFeed(page: Page) {
  await page.exposeFunction('__decodeRecoveryScope', (data: number[], contentType: string) => {
    let payload = new Uint8Array(data);
    if (contentType.includes('connect+')) {
      const size = new DataView(payload.buffer).getUint32(1);
      if (payload[0] !== 0 || size > payload.length - 5) throw new Error('unexpected controlled request envelope');
      payload = payload.slice(5, 5 + size);
    }
    const request = contentType.includes('json')
      ? fromJsonString(SubscribeEventsRequestSchema, new TextDecoder().decode(payload))
      : fromBinary(SubscribeEventsRequestSchema, payload);
    return { orgId: request.orgId || undefined, projectId: request.projectId || undefined };
  });
  await page.addInitScript(() => {
    const connections: FeedConnection[] = [];
    const controllers = new Map<number, ReadableStreamDefaultController<Uint8Array>>();
    const send = (id: number, subject: string) => {
      const connection = connections[id];
      if (!connection?.open) throw new Error(`feed ${id} is closed`);
      const bytes = new TextEncoder().encode(JSON.stringify({
        subject, orgId: subject.startsWith('stream.') ? '' : connection.orgId,
        projectId: subject.startsWith('stream.') ? undefined : connection.projectId,
        occurredAt: new Date().toISOString(),
      }));
      const frame = new Uint8Array(bytes.length + 5);
      new DataView(frame.buffer).setUint32(1, bytes.length);
      frame.set(bytes, 5);
      controllers.get(id)!.enqueue(frame);
    };
    window.__recoveryFeed = {
      autoReady: true, rejectNew: false, connections, send,
      drop(id) {
        connections[id].open = false;
        controllers.get(id)!.error(new TypeError('controlled feed disconnect'));
      },
    };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith('/tasker.health.v1.EventService/SubscribeEvents')) return realFetch(input, init);
      const request = new Request(input, init);
      const scope = await window.__decodeRecoveryScope([...new Uint8Array(await request.arrayBuffer())], request.headers.get('Content-Type') ?? '');
      const connection = { id: connections.length, ...scope, open: true };
      connections.push(connection);
      const aborted = () => {
        if (!connection.open) return;
        connection.open = false;
        controllers.get(connection.id)!.error(new DOMException('aborted', 'AbortError'));
      };
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controllers.set(connection.id, controller); },
        cancel() { connection.open = false; request.signal.removeEventListener('abort', aborted); },
      });
      request.signal.addEventListener('abort', aborted, { once: true });
      if (request.signal.aborted) aborted();
      else if (window.__recoveryFeed.rejectNew) {
        connection.open = false;
        controllers.get(connection.id)!.error(new TypeError('controlled broker outage'));
      }
      else if (window.__recoveryFeed.autoReady) send(connection.id, 'stream.ready');
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/connect+json' } });
    };
  });
}

export async function currentFeed(page: Page): Promise<number> {
  const find = () => page.evaluate(() => {
    const params = new URLSearchParams(location.search);
    return window.__recoveryFeed.connections.filter(connection => connection.open
      && connection.orgId === (params.get('org') ?? undefined) && connection.projectId === (params.get('project') ?? undefined)).at(-1)?.id ?? -1;
  });
  try {
    await expect.poll(find).toBeGreaterThanOrEqual(0);
  } catch (error) {
    const state = await page.evaluate(() => ({ path: location.pathname + location.search, connections: window.__recoveryFeed.connections }));
    throw new Error(`No open feed for current scope: ${JSON.stringify(state)}`, { cause: error });
  }
  return find();
}
