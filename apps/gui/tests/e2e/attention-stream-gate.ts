import { createServer, request as httpRequest, type ServerResponse, type ClientRequest } from 'node:http';

/** Owned loopback test proxy: cuts only this browser's event streams. */
export async function eventStreamGate(upstream: string) {
  let blocked = false;
  const active = new Set<ServerResponse>(), requests = new Set<ClientRequest>(), waiting = new Set<() => void>();
  const server = createServer((request, response) => {
    const stream = request.url?.endsWith('/EventService/SubscribeEvents') || request.url?.endsWith('.EventService/SubscribeEvents');
    const forward = () => {
      waiting.delete(forward); if (response.destroyed) return;
      if (stream) active.add(response);
      const target = new URL(request.url!, upstream);
      const proxy = httpRequest(target, { method: request.method, headers: { ...request.headers, host: target.host } }, incoming => {
        response.writeHead(incoming.statusCode ?? 502, incoming.headers); incoming.pipe(response);
      });
      requests.add(proxy);
      proxy.on('close', () => requests.delete(proxy));
      proxy.on('error', () => { if (!response.destroyed) response.destroy(); });
      response.on('close', () => { active.delete(response); proxy.destroy(); });
      request.pipe(proxy);
    };
    response.on('close', () => waiting.delete(forward));
    if (stream && blocked) waiting.add(forward); else forward();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing owned proxy address');
  return {
    url: `http://localhost:${address.port}`,
    cut() { blocked = true; for (const response of active) response.destroy(); },
    release() { blocked = false; for (const forward of [...waiting]) forward(); },
    async close() { blocked = false; waiting.clear(); for (const request of requests) request.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

/** Native observer proves a change was published while the browser was gated. */
export async function observeOrgEvents(base: string, cookie: string, orgId: string) {
  const controller = new AbortController(), body = new TextEncoder().encode(JSON.stringify({ orgId }));
  const frame = new Uint8Array(body.length + 5); new DataView(frame.buffer).setUint32(1, body.length, false); frame.set(body, 5);
  const response = await fetch(`${base}/tasker.health.v1.EventService/SubscribeEvents`, { method: 'POST', signal: controller.signal, headers: { cookie, 'content-type': 'application/connect+json', 'connect-protocol-version': '1' }, body: frame });
  if (!response.ok || !response.body) { controller.abort(); throw new Error(`Observer stream refused: ${response.status}`); }
  const seen = new Set<string>(), listeners = new Map<string, Set<(error?: Error) => void>>();
  let failure: Error | undefined, ended = false;
  const reading = (async () => {
    let buffer = new Uint8Array(0);
    for await (const chunk of response.body!) {
      const joined = new Uint8Array(buffer.length + chunk.length); joined.set(buffer); joined.set(chunk, buffer.length); buffer = joined;
      while (buffer.length >= 5) {
        const length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(1, false); if (buffer.length < length + 5) break;
        const flags = buffer[0], bytes = buffer.slice(5, length + 5); buffer = buffer.slice(length + 5);
        if (flags !== 0) continue;
        const event = JSON.parse(new TextDecoder().decode(bytes)) as { subject?: string; orgId?: string };
        if (typeof event.subject === 'string' && (event.subject === 'stream.ready' || event.orgId === orgId)) {
          seen.add(event.subject); for (const finish of [...listeners.get(event.subject) ?? []]) finish();
        }
      }
    }
  })().catch(error => { if (!controller.signal.aborted) failure = error instanceof Error ? error : new Error('Observer reader failed'); })
    .finally(() => { ended = true; for (const pending of listeners.values()) for (const finish of [...pending]) finish(failure ?? new Error('Observer stream ended')); });
  const waitFor = async (subject: string) => {
    if (seen.has(subject)) return;
    if (failure) throw failure;
    if (ended) throw new Error('Observer stream ended');
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); listeners.get(subject)?.delete(finish); if (error) reject(error); else resolve(); };
      if (!listeners.has(subject)) listeners.set(subject, new Set()); listeners.get(subject)!.add(finish);
      const timer = setTimeout(() => finish(new Error(`Observer did not receive ${subject}`)), 5000);
    });
  };
  try { await waitFor('stream.ready'); }
  catch (error) { controller.abort(); await reading; throw error; }
  return { waitFor, async close() { controller.abort(); await reading; } };
}
