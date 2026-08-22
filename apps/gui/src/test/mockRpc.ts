import { setupServer } from 'msw/node';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { BACKEND_URL } from '../lib/backendUrl';

/**
 * Network-level interception for RPC tests (M12-T01).
 *
 * Every GUI test used to mock `@connectrpc/connect`'s `createClient` itself,
 * returning a plain object whose methods were `vi.fn().mockResolvedValue(...)`.
 * That mock never serialized anything: the same test author wrote both the
 * fake response and the assertion against it, so a real drift between what a
 * component sends or expects and what the contract actually says had nothing
 * to catch it against. `contract.roundtrip.test.ts` and the backend's
 * `wire.integration.test.ts` close that gap for the schema and the server; this
 * closes it for the GUI's own code, by intercepting the request MSW sees on
 * the wire and answering with real JSON that the real transport has to decode.
 *
 * The service objects imported by application code (`HealthService`,
 * `TaskService`, ...) are never mocked here — they are the real generated
 * descriptors, and `createClient`/`createConnectTransport` are the real
 * library functions. Only the `fetch` call underneath is intercepted.
 */

export const server = setupServer();

/**
 * Registers a response for one RPC.
 *
 * `service` is the real generated service object (`TaskService`,
 * `HealthService`, ...) — its `.typeName` is what names the URL a Connect
 * client actually posts to (verified against a live server: `POST
 * /tasker.health.v1.HealthService/Ping`), so the path here is not hand-typed
 * and cannot drift from what the client really sends.
 *
 * `response` is a plain object matching the RPC's response message shape,
 * exactly as JSON — the same shape `contract.roundtrip.test.ts` proves is
 * exactly what the real backend emits. Passing an object shaped like a
 * *different* message, or missing a field a component reads, fails at the
 * component under test rather than at a hand-written stub that always agreed
 * with itself.
 *
 * Accepts a function of the parsed request body, so a test can answer
 * differently depending on what was actually sent — which is itself part of
 * what this replaces: a request whose shape the mock never looked at.
 */
export function mockRpc(
  service: { typeName: string },
  method: string,
  response: JsonBodyType | ((body: any) => JsonBodyType),
) {
  server.use(
    http.post(`${BACKEND_URL}/${service.typeName}/${method}`, async ({ request }) => {
      const body = await request.json().catch(() => ({}));
      const resolved = typeof response === 'function' ? response(body) : response;
      return HttpResponse.json(resolved);
    }),
  );
}

/**
 * Registers a Connect error for one RPC.
 *
 * `code` is the lowercase wire form Connect actually sends (`"unauthenticated"`,
 * `"permission_denied"`, `"not_found"`, ...) — verified against a real server
 * that a Connect client parses the `code` field from the JSON body itself
 * rather than depending on the HTTP status matching a specific mapping, so the
 * status here does not need to be exact, only in the error range.
 */
export function mockRpcError(service: { typeName: string }, method: string, code: string, message: string) {
  server.use(
    http.post(`${BACKEND_URL}/${service.typeName}/${method}`, () =>
      HttpResponse.json({ code, message }, { status: 400 }),
    ),
  );
}

/**
 * Registers an RPC that does not answer until the test says so — for "is it
 * still pending" / "what if the component unmounts before this resolves"
 * cases, which is the one shape the JSON-value form of `mockRpc` cannot
 * express (there is no request in hand yet to resolve later).
 */
export function mockRpcPending(service: { typeName: string }, method: string) {
  let settle!: (response: JsonBodyType) => void;
  const promise = new Promise<JsonBodyType>((resolve) => {
    settle = resolve;
  });
  server.use(
    http.post(`${BACKEND_URL}/${service.typeName}/${method}`, async () => HttpResponse.json(await promise)),
  );
  return { resolve: settle };
}

/**
 * One length-delimited Connect streaming frame: `[flags:1][len:4 BE][json]`.
 * `flags = 2` marks the end-of-stream trailer frame — verified against a real
 * server (`probe-stream.ts`, run once by hand): without it the client never
 * learns the stream ended and treats the closed connection as an error,
 * triggering reconnect instead of delivering what was sent.
 */
function connectFrame(payload: object, flags = 0): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const out = new Uint8Array(5 + json.length);
  out[0] = flags;
  new DataView(out.buffer).setUint32(1, json.length, false);
  out.set(json, 5);
  return out;
}

/**
 * A streaming RPC's response (M08's `SubscribeEvents`), as Connect's real
 * unary-streaming wire format: one length-delimited frame per message.
 *
 * **The connection is left open**, deliberately not closed with an
 * end-of-stream trailer. `SubscribeEvents` is long-lived by design — the real
 * server only ends it when the client disconnects — and `useLiveEvents`
 * treats the stream ending at all as a failure and reconnects. A helper that
 * sent a trailer would make every test race that reconnect loop instead of
 * observing the frames it asked for, which is what happened here first: with
 * a closing trailer, the hook cycled live → reconnecting → live every 1ms and
 * a `waitFor` assertion caught it mid-cycle roughly as often as it did not.
 */
export function mockRpcStream(service: { typeName: string }, method: string, frames: object[]) {
  server.use(
    http.post(`${BACKEND_URL}/${service.typeName}/${method}`, () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) controller.enqueue(connectFrame(frame));
          // No controller.close(): the real connection stays open until the
          // client aborts it, which is what happens on unmount / a scope
          // change and is what actually ends this stream in a test too.
        },
      });
      return new HttpResponse(body, { headers: { 'content-type': 'application/connect+json' } });
    }),
  );
}
