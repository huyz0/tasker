# Security Standards

## 1. Validation & Deserialization

- **Rule**: Never trust boundary inputs (Client API, Webhook, Queue Events).
- **Zod**: Validation via a strict Zod schema occurs BEFORE execution hits
  domain logic. Zod is the only validation library here — ArkType is not
  installed.
- **Coercion**: Strip unlisted JSON fields from incoming properties natively.

## 2. Authentication & Authorization

- **Verification Lifecycle**: Route middleware must assert Authentication
  tokens.
- **RBAC Ownership**: Backend handlers MUST verify the authenticated `userId`
  genuinely holds ownership/role rights against the target database resource.
  Simply logging in is insufficient.
- **Fail Closed**: All new backend controllers default to `401/403` denied
  unless explictly decorated as public.

## 3. Vulnerability Mitigation

- **XSS**: Use React/Template auto-encoding. Never inject raw HTML without
  `DOMPurify` overrides.
- **CSRF**: Apply `SameSite=Lax/Strict`, `HttpOnly`, and `Secure` to session
  cookies.

## 4. Secrets Config

- **Zero Hardcoding**: Do NOT commit `.env` values or raw API keys in code.
- **CI Safety**: CI/CD must mechanically mask secrets on terminal output.

## 5. Dependency Security

- **Auditing**: Break builds on high CVSS vulnerability alerts. **No scanner is
  wired up yet** — it is owned by M11. Do not write `npm audit`; `npm`, `npx`,
  `yarn` and `pnpm` are forbidden repo-wide (`AGENTS.md`).
- **Locking**: One lockfile, `bun.lock`, at the workspace root. A second
  lockfile anywhere in the tree is a defect — see `dependency-standard.md`.
