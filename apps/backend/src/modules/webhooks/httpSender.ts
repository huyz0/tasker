import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress, safeLookup, type Resolver } from './urlSafety';
import type { Sender } from './delivery';

const REQUEST_TIMEOUT_MS = 10_000;

/** No redirects; validate DNS at connection time and bound the entire attempt,
 * including lookup, handshake, headers and a continuously trickling body. */
export function httpSender(allowPrivate: boolean, resolve?: Resolver, timeoutMs = REQUEST_TIMEOUT_MS): Sender {
  const deadlineMs = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, REQUEST_TIMEOUT_MS)) : REQUEST_TIMEOUT_MS;
  return (url, body, headers) => new Promise((resolvePromise, reject) => {
    const target = new URL(url);
    const host = target.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && isIP(host) && !isPublicAddress(host)) {
      reject(new Error(`refusing to connect to non-public address ${host}`));
      return;
    }
    const transport = target.protocol === 'https:' ? https : http;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (error: Error) => { if (timer) clearTimeout(timer); reject(error); };
    const req = transport.request(target, {
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
      lookup: safeLookup(allowPrivate, resolve) as any,
      timeout: deadlineMs,
    }, res => {
      res.resume();
      res.on('end', () => { if (timer) clearTimeout(timer); resolvePromise({ status: res.statusCode ?? 0 }); });
      res.on('error', fail);
    });
    const timedOut = () => {
      const error = new Error(`timed out after ${deadlineMs / 1000} s`);
      fail(error);
      req.destroy(error);
    };
    timer = setTimeout(timedOut, deadlineMs);
    req.on('timeout', timedOut);
    req.on('error', fail);
    req.end(body);
  });
}
