# ADR-0019 — No in-process transport in the standalone binary

- **Status**: Accepted
- **Date**: 2026-08-22
- **Milestone**: M09 — Portable Single Binary (M09-T04)
- **Supersedes**: the "in-process transport" line item in
  `.specs/product/architecture.md`'s M09 section

## Context

`apps/backend/src/index.ts` has carried an exported stub since before this
repository's recorded history:

```ts
export const localInProcessTransportRouter = (_req: any) => {
   return { status: 200, message: "in-process override active" };
};
```

Nothing calls it. It returns a fixed object, satisfies no Connect-RPC contract,
and has no test. `architecture.md` twice describes it as work M09 would
complete: "replacing the `localInProcessTransportRouter` stub with a real
in-process transport that satisfies the same Connect-RPC contract, removing
network overhead inside the binary."

M09's exit criteria require this question to be answered either way — the
milestone's own wording is "implemented or deleted, with an ADR recording the
decision" — because an unreferenced stub that the specifications describe as a
planned feature is worse than either outcome. A reader cannot tell whether it
is unfinished work or abandoned work.

Now that the binary exists and serves the GUI (M09-T02/T03), the question is
concrete: when the browser, the API and the database are all inside one
process, should the browser's RPC calls still go over a loopback socket?

## Options

**1. Implement a real in-process transport.** A `Transport` that dispatches
straight into the Connect router, skipping the HTTP layer.

The saving is a loopback round-trip: on the order of tens of microseconds
against handlers that do database work measured in milliseconds. Against that,
it is a *second* path into every handler. The socket path carries the session
interceptor, the agent-token rate limiter, the request-logging interceptor, the
CORS and body-size limits, and the request-context lifecycle — all of it
written once, in one order, in `index.ts`. A second entry point either
duplicates that ordering or quietly skips part of it, and the part most easily
skipped is authentication.

It also does not help the case it appears to. The GUI is a *browser*
application. Its RPC calls originate in a browser process, over a real socket,
whatever the server does internally. An in-process transport could only serve
code running inside the binary itself — of which there is none.

**2. Delete the stub and drop the claim.** No transport, no second code path,
one way in.

The cost is the loopback hop, which is already how every other deployment
works and is not on any measured critical path (M07's latency work found the
time in queries, not in sockets).

**3. Leave it.** Rejected without much argument: it is dead code that the
specifications advertise as a feature. Whatever the right answer is, "neither"
is not it.

## Decision

**Option 2.** `localInProcessTransportRouter` is deleted, and
`architecture.md`'s two references to it are replaced with a pointer here.

The single binary's claim is *one file, no dependencies* — not *no sockets*.
Loopback is a socket the operating system never puts on a wire, and paying one
per RPC buys a single, auditable path through authentication and rate limiting
for every caller, browser or agent, standalone or clustered.

## Consequences

- The standalone binary serves its own GUI over `http://localhost:<port>`, the
  same protocol a clustered deployment uses. There is exactly one request path,
  so a security or logging change lands in one place.
- Nothing in the product measures a loopback hop as a cost today. If that ever
  changes — a workload that makes many small RPCs from inside the binary,
  which does not exist now — this decision should be revisited *with the
  measurement in hand*, which is what ADR-0003 says about read stores and
  applies here for the same reason.
- The word "embedded" in the specifications now means the GUI and the
  migrations, both of which are genuinely inside the file. It no longer implies
  a transport.
