# Security Standards

## 1. Validation & Deserialization

- **Rule**: Never trust boundary inputs (Client API, Webhook, Queue Events).
- **Zod**: Validation via strict schema (Zod/ArkType) occurs BEFORE execution
  hits domain logic.
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

- **Auditing**: Break builds on high CVSS vulnerability alerts (`npm audit` /
  Snyk).
- **Locking**: Enforce deterministic versioning via `pnpm-lock.yaml` or
  `package-lock.json`.
