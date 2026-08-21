# Security review — M11 (Observability & Deployability)

- **Date**: 2026-08-22
- **Scope**: the full request surface, with particular attention to what M11
  added — three unauthenticated endpoints, a tracing pipeline that leaves the
  process, a container image, and a deployment manifest.
- **Outcome**: **no open critical or high findings.** Four issues were found
  and fixed during the review; five decisions are recorded as accepted with
  reasons.

## Method

Evidence, not assertion. Every line below names the file it is about, and the
"verified" items were checked by running the thing rather than reading it —
against a live backend, a live consumer, a real broker, and the container image
built from `apps/backend/Dockerfile`.

## Fixed during this review

**1. `/metrics` had no way to be closed.** The counters name every route and
RPC method this service exposes. That is not tenant data, but it is an
inventory, and a deployment that puts the API on a public address had no way to
withhold it. Now gated on an optional `METRICS_TOKEN` — open by default, since
the common case is a scraper on a private network and a token there is
ceremony. `src/index.ts`.

**2. Five reachable Go standard-library vulnerabilities.** `govulncheck` traced
them through the CLI's own generated Connect client into `net/http` at
go1.26.5. Fixed by pinning go1.26.6 in `.prototools` and `apps/cli/go.mod`;
`govulncheck` now reports none. The standard library is a dependency like any
other.

**3. Four critical JavaScript advisories**, all in `@vitest/browser`, cleared
by `bun update`. Fourteen high-severity advisories remain, every one transitive
through a development dependency — see the accepted list below.

**4. A permanently-red gate, which is a gate that gets switched off.** The
first cut of `scripts/audit-dependencies.sh` failed on all fourteen and would
have stayed failing. Rewritten as a ratchet: new high or critical advisories
break the build, the fourteen already present are listed by GHSA id with a
reason and the route they reach us by.

While building that, `bun audit --ignore` was found to accept a
comma-separated list silently and match nothing — the gate reported green while
ignoring nothing at all, which is the worst possible failure for a security
check. One `--ignore=` per id.

## Reviewed and accepted

**`/healthz` and `/readyz` are unauthenticated.** They must be: a probe runs
before the process is ready and holds no credential. `/healthz` returns a
status word and an uptime; `/readyz` adds a lifecycle state and an in-flight
count. Neither touches the database and neither names a tenant.
`src/lib/lifecycle.ts`.

**`/api/auth/providers` is unauthenticated.** It is read on the sign-in screen,
so it has to be, and it returns two booleans: whether Google is configured and
whether passwords are. It confirms nothing an attempt against either endpoint
would not. `src/modules/auth/auth.ts`.

**Spans leave the process when an endpoint is configured.** They carry
identities only — method, principal kind, org id, request id, outcome, Connect
error code — and never payload. A tracing backend has different access rules
from the database, and a span holding task titles would be a copy of one inside
the other. Enforced by `spanAttributesFor` being the single place attributes
are built, and asserted in `tracingInterceptor.test.ts`.

**`traceparent` is written into event payloads, which the audit trail stores
verbatim.** It is 55 bytes of trace and span id with no secret in it, and being
able to jump from an audit row to the trace that produced it is the point.

**Fourteen high-severity advisories in development dependencies.** Listed with
reasons in `scripts/audit-dependencies.sh`. One deserves naming here:
`js-yaml`'s quadratic `!!omap` parse (GHSA-5p4m-2wfm-xmqj) reaches us through
`@mdxeditor/editor`, which **ships to the browser**. Accepted rather than
urgent because the editor parses markdown and nothing in the GUI feeds it YAML
— and it is the first line to clear when a fixed version exists.

## Checked, nothing found

**Path traversal in the static server.** Structurally impossible:
`StaticSite.resolve` is a `Map` lookup over an in-memory manifest and never
touches a filesystem. `../../../etc/passwd` is a key that is not present, and a
miss under `/assets/` is a 404 rather than a fallback. `src/lib/staticServer.ts`.

**Secrets in the container image.** `.dockerignore` excludes `**/.env`,
`**/.data` and `*.sqlite` from the build context — a context is readable from
inside the build, so a stray credentials file there is one shipped to anyone
who can run `docker history`. Verified by inspecting the built image: it
contains two binaries, no source and no dotfiles.

**Container privilege.** Runs as uid 10001, non-root, verified with
`docker exec … id`. The runtime layer has no interpreter and no package
manager. The Kubernetes sample adds `readOnlyRootFilesystem`,
`allowPrivilegeEscalation: false` and `capabilities: drop: [ALL]`.

**Secrets in logs.** No log line interpolates a password, token or key. The one
grep hit — `auth.password_register_failed` — logs the error object from a
registration attempt, not the credential.

**Tenant isolation on the live feed.** Reviewed in M08 and re-verified here: a
user sharing no organization with the publisher receives only the stream's
`stream.ready` control frame.

**The first-run `--seed` path.** Creates a workspace for the first account
only, gated on a count of users, and never for the second.
`src/lib/firstRun.test.ts`.

## Not in scope, and named rather than left implied

- **Rate limiting is per instance.** Both the agent-token limiter and the
  password-login limiter hold state in memory, so N replicas multiply the
  effective limit by N. Recorded before M11 and still true; a shared store is
  the fix and it needs a decision about which store.
- **No CSP or security headers on the SPA.** The binary serves `index.html`
  with a content type and a cache header and nothing else. Worth a pass of its
  own, sized as a task rather than a note.
- **No image signing or SBOM.** M09 scoped code signing out; the same reasoning
  covers image provenance for now.
