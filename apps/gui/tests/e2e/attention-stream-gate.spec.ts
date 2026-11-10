import { createServer } from 'node:http';
import { test, expect } from '@playwright/test';
import { observeOrgEvents } from './attention-stream-gate';

for (const mode of ['malformed', 'no-ready']) test(`an observer ${mode} startup closes its owned stream before returning failure`, async () => {
  let closed = false;
  const upstream = createServer((_request, response) => {
    response.on('close', () => { closed = true; });
    const body = Buffer.from('{malformed'), frame = Buffer.alloc(body.length + 5); frame.writeUInt32BE(body.length, 1); body.copy(frame, 5);
    response.writeHead(200, { 'content-type': 'application/connect+json' });
    if (mode === 'malformed') response.write(frame); else response.flushHeaders();
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address(); if (!address || typeof address === 'string') throw new Error('Missing owned server');
  try {
    await expect(observeOrgEvents(`http://127.0.0.1:${address.port}`, 'fixture-session=opaque', 'owned-org')).rejects.toThrow();
    await expect.poll(() => closed).toBe(true);
  } finally { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
