# Security standards

## 1. Boundary validation

Validate API, webhook and broker inputs before domain work using the declared
Zod schemas. Generated wire shape does not prove tenant scope, size limits,
state-machine validity or safe URLs. Unknown-field handling belongs to the
endpoint's compatibility policy; strict rejection and stripping are not
interchangeable global guarantees.

## 2. Identity and authorization

Local/linked human sessions and scoped agent tokens are distinct principal
types. Authentication resolution is in `lib/authenticate.ts`; resource
authorization and policy are in `lib/authz.ts`. Logging in alone grants no
target access.

Agent-capable handlers use the current principal, canonical tenant/project,
closed RPC scope map and human policy permission. Human-only operations
refuse agents explicitly. Current membership/credential state governs
keyed-response replay and stream revalidation; cached data is not an access
grant. Canonical resource checks precede tenant data disclosure.

Connect uses Unauthenticated/PermissionDenied/NotFound as appropriate; HTTP
routes use their actual status/protocol. Do not impose a nonexistent
decorator-based 401/403 gateway on every controller. New agent methods must
pass the existing scope sweep.

## 3. Browser and outbound boundaries

Keep React escaping and the Markdown renderer's `rehype-sanitize`
pipeline (`apps/gui/src/components/ui/MarkdownRenderer.tsx`). Do not add
raw unsanitized HTML or assume an uninstalled sanitizer is available.

Session cookies use the configured HttpOnly/SameSite/Secure policy.
Preserve auth origin/content-type/nonce protections; a JSON password route
and OAuth callback have different CSRF boundaries.

Webhook URLs must pass the existing connection-time DNS/address checks
(`modules/webhooks/urlSafety.ts`), not just a save-time string validator.
Preserve signed delivery identity, bounded retries and stale-owner fencing.
MCP forwards the caller's credential through the same RPC authorization;
it is not an alternative privileged execution channel.

## 4. Secrets and diagnostic privacy

Keep real credentials, encryption material and user bodies out of source,
logs, reports, URLs and process arguments. Use the existing validated safe
error serializers; raw driver exceptions can contain SQL/body values.

Disposable fixtures may generate their own credentials and isolated service
passwords. They must never select a caller's deployment/schema for cleanup.
Track only owned resources and restore ambient state. Private SQL backups
are confidential data and must not become CI artifacts. Production restores
need the corresponding encryption secrets under normal secret management.

Do not log tokens to demonstrate masking. CI masking supplements, rather
than replaces, keeping secrets out of output.

## 5. Dependency and toolchain gates

`.github/workflows/ci.yml` already runs the JavaScript high/critical
vulnerability ratchet (`scripts/audit-dependencies.sh`) and reachable Go
vulnerability checks using govulncheck. The old claim that no scanner is
wired is false. Preserve these gates and documented exception handling;
do not suppress a new advisory to make publication green.

Use the repository-pinned Node/Bun/Moon/Go selection and the root
`bun.lock`. Use Bun for package management and agent-invoked JS/TS commands; run existing
repository gates through their declared Moon tasks. Their Node-based gates
use the pinned Node executable. npm/npx/yarn/pnpm are forbidden. Do not add an undeclared package, second lockfile or runtime
to implement a security recommendation. Existing patch constraints and their
reasons are recorded in `.specs/product/tech-stack.md`.

Rate limiting is per process (`lib/rateLimit.ts`); replicas multiply the
budget. Retry-After is a minimum wait before another attempt, not a guarantee
that future capacity will be available. M49's saturated 1000-caller result
does not establish a healthy fleet or eliminate overload risk.
