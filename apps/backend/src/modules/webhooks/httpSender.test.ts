import { expect, it } from 'bun:test';
import * as http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { httpSender } from './delivery';

it('enforces a total deadline even while a receiver keeps sending response body bytes', async () => {
  const sockets = new Set<Socket>();
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.write('first');
    const trickle = setInterval(() => res.write('still running'), 5);
    res.on('close', () => clearInterval(trickle));
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const start = Date.now();
  const emergency = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 300);
  try {
    const port = (server.address() as AddressInfo).port;
    await expect(httpSender(true, undefined, 60)(`http://127.0.0.1:${port}/events`, '{}', {})).rejects.toThrow('timed out');
    expect(Date.now() - start).toBeLessThan(1000);
  } finally {
    clearTimeout(emergency);
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 2000);

it('includes a stalled DNS lookup in the total attempt deadline', async () => {
  const neverResolves = async (): Promise<Array<{ address: string; family: number }>> => new Promise(() => {});
  const started = Date.now();
  await expect(httpSender(true, neverResolves, 40)('http://fixture.example/events', '{}', {})).rejects.toThrow('timed out');
  expect(Date.now() - started).toBeLessThan(1000);
}, 2000);
