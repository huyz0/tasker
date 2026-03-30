# Security Standards

This document enforces critical foundational security practices that must be adopted across all layers of the project stack.

## 1. Input Validation & Deserialization
- **Rule**: Never trust input. Not from the client, not from internal queue events, and not from external webhooks.
- **Zod Schemas**: Every interaction over a network boundary—REST, GraphQL, gRPC, WebSocket messages—must be fundamentally validated against strict schemas (like Zod or ArkType) *before* hitting domain business logic.
- **Type Coercion**: Ensure serializers cannot maliciously interpret unexpected object shapes. Strip all unlisted fields from incoming JSON payloads by default.

## 2. Authentication & Authorization (RBAC)
- **Authentication Lifecycle**: Session management or JWT verification must be explicitly proven via middleware on any route handling protected data.
- **Role-Based Access Control (RBAC)**: Validating *who* the user is not enough. You must also validate *what they are allowed to do*. Do not assume a user ID in the JWT gives them ownership of a resource. Backend handlers must verify the user's role/ownership against the requested entity in the database layer.
- **Fail Closed**: All new backend endpoints default to being rejected (401/403) unless specifically decorated or mapped to an open/public route definition.

## 3. Vulnerability Mitigation
- **XSS (Cross-Site Scripting)**:
  - Use modern framework APIs (like React) that automatically HTML-encode variables in templates.
  - Never use dangerous APIs like `dangerouslySetInnerHTML` unless explicitly required, and only then with data processed through a trusted HTML sanitizer library like DOMPurify.
- **CSRF (Cross-Site Request Forgery)**:
  - If using cookie-based auth, set `SameSite=Strict` or `Lax` and use `HttpOnly` and `Secure`.
  - Prefer Anti-CSRF token exchanges for state-mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`) if relying solely on persistent session cookies without `SameSite` protections.

## 4. Secrets management
- **Hardcoding**: Absolutely zero hardcoded credentials, tokens, or private URLs in the repository. Do not commit `.env` or configuration containing live non-empty keys.
- **CI/CD Visibility**: Scripts or CI workflows must mask secrets. Avoid echoing variables into logs.

## 5. Dependency Security
- **Auditing**: Leverage automated tooling (`npm audit` or external scanners like Snyk) to block builds if a high-severity CVSS score vulnerability is found in the dependency tree.
- **Locking**: Always use lockfiles (`package-lock.json`, `pnpm-lock.yaml`) and lock library versions explicitly in production dependencies.
