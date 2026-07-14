# Debugging Runbook

Practical steps for investigating a problem in a locally running Tasker
instance. This assumes `moon run dev` (see [README.md](README.md)) or the
individual `apps/backend`/`apps/gui` dev servers are running.

## Starting from empty vs. realistic data

A fresh local DB has no data. If the bug you're chasing depends on scale
(pagination, sort order, a list with enough rows to matter), seed some
fixtures first:

```bash
cd apps/backend && bun run seed
```

This creates an org, a project with ~150 tasks, a few agents, and some
labels, and prints a session token for the seeded user - paste it into a
`session` cookie in the browser, or pass it as `Authorization: Bearer <token>`
to the CLI or curl.

## Reading logs

The backend logs structured JSON to stdout by default. Set `LOG_FILE=path`
to also write every line to a file (in `append` mode, so history survives a
restart):

```bash
LOG_FILE=.data/backend.log STANDALONE=true bun run src/index.ts
```

Every RPC's log lines carry a `requestId` (and `userId`, once authenticated)
automatically - see `requestContext.ts` and `logger.ts`'s pino `mixin`. To
follow one request end to end:

```bash
grep '"requestId":"<id>"' .data/backend.log
```

The `requestId` also propagates into any NATS event that request triggers
(`natsCorrelation.ts`), so a downstream consumer's log lines carry the same
id back to the request that caused them.

If a bug only reproduces with a noisier log level, you don't need to restart
the process - flip the live level without downtime:

```bash
curl -X POST http://localhost:8080/api/debug/log-level \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"level":"debug"}'
```

## Checking what's actually broken

Client-side (GUI) errors ship to the backend's log stream automatically
(`RemoteErrorReporter`), so "the GUI broke" doesn't require asking the user
to paste devtools output. The last 100 backend errors (client and server
side) are queryable without log/file access:

```bash
curl http://localhost:8080/api/debug/errors -H "Authorization: Bearer <admin-token>"
```

Both endpoints above require org-admin-of-any (`assertOrgAdminOfAny`) - use
the seeded user's token, which is an org admin.

## Confirming what the server actually resolved its config to

Environment-dependent bugs ("why isn't CORS allowing this origin", "is test
login actually on") are often really "what did this process boot with,
not what I think I set":

```bash
curl http://localhost:8080/api/debug/config -H "Authorization: Bearer <admin-token>"
```

Secrets are excluded from the response, not just redacted - it's safe to
paste this output into a bug report.

## Checking a session token

`tasker debug session [token]` decodes a session token's claims locally
(userId, jti, expiry) and asks the backend whether it's still actually valid
- catches both expiry and revocation (see `sessionInterceptor` in
`index.ts`), neither of which a local decode alone can tell you:

```bash
tasker debug session                    # uses the CLI's saved credentials
tasker debug session eyJ1c2VySWQ...     # or check a specific token
```

## Checking dependency health and latency

`tasker ping` (or the Dashboard's "Ping Backend" button, which calls the
same `HealthService.Ping` RPC) reports DB and NATS connectivity plus
round-trip latency for each, so "is it actually connected" and "is it just
slow" are distinguishable instead of both collapsing into a single status
string.

## Inspecting the database directly

With `docker compose up -d adminer` (see `docker-compose.yml`), a
browser-based DB UI is available at `http://localhost:8081`, pre-pointed at
the `mysql` service. In `STANDALONE=true` mode (SQLite, the default for
local dev) there's no separate DB process - the file lives at
`apps/backend/.data/local.sqlite` and can be opened with any SQLite client.

## Per-RPC latency

Every 5 minutes the backend logs a `rpc.latency_summary` line (see
`rpcMetrics.ts`) with p50/p99/error-count per RPC method, sorted worst-first
- useful for spotting which endpoint is actually slow without needing a
dedicated metrics backend for local investigation.

To pull a snapshot on demand instead of waiting for the next log line - and
to also see the plain HTTP routes (`/api/auth/*`, `/api/client-errors`,
`/api/debug/*`) that summary doesn't cover - hit `/api/debug/metrics`:

```bash
curl http://localhost:8080/api/debug/metrics -H "Authorization: Bearer <admin-token>"
```

## Business event volume

`rpc.latency_summary` tells you about traffic; it doesn't tell you about
real product activity, since it counts every call including failed/rejected
attempts. `GET /api/debug/business-events` (also logged periodically as
`business_events.summary`) counts confirmed successful domain mutations
instead - tasks actually created, projects actually created, and so on:

```bash
curl http://localhost:8080/api/debug/business-events -H "Authorization: Bearer <admin-token>"
```

## Build identification

The GUI's sidebar footer shows the build's git SHA (falls back to `dev` for
local builds), so "did the fix I just made actually reach what's in the
browser" doesn't require guessing.
