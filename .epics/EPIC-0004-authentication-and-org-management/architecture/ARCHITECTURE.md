# Architecture Design: Authentication & Organization Management (EPIC-0004)

## Approach

This design establishes the pattern for Multi-Tenancy and Identity. We use a Session-based token approach combined with an `X-Organization-ID` HTTP header for multi-tenant data scoping.

### bounded Context: Identity & Access Management (IAM)
- **Identity Provider**: Google Workspace (OAuth2.1).
- **Session Tokens**: We will issue a secure HttpOnly cookie for web browsers, and a transparent JWT bearer token for the CLI. Both encode the `user_id` and essential claims.
- **Data Scoping**: Every request to a core domain (Projects, Tasks) must include `X-Organization-ID`. The IAM middleware will verify if the authenticated `user_id` is an active member of the requested `org_id` before processing the command.

### Database Schema (Drizzle ORM)

#### `users`
- `id`: VARCHAR (Primary Key, unique identifier)
- `email`: VARCHAR (Unique)
- `name`: VARCHAR
- `avatar_url`: VARCHAR
- `created_at`: TIMESTAMP

#### `organizations`
- `id`: VARCHAR (Primary Key)
- `name`: VARCHAR
- `slug`: VARCHAR (Unique)
- `created_at`: TIMESTAMP

#### `organization_members`
- `org_id`: VARCHAR (Foreign Key)
- `user_id`: VARCHAR (Foreign Key)
- `role`: ENUM ('admin', 'member')
- `joined_at`: TIMESTAMP
- *Composite Primary Key (org_id, user_id)*

### Connect-RPC Flow
1. **Frontend**: The user opens `/login`. It redirects to Google OAuth.
2. **Backend**: Google redirects to `/api/auth/callback` on Bun.
3. **Backend**: Validates code, fetches email, upserts `users` record. If new, it prompts for seed org creation in the DB.
4. **Backend**: Issues an HttpOnly cookie and redirects to `/`.
5. **Connect-RPC**: Interceptors extract the cookie or Bearer token, validate the session, fetch the associated `user` object, and attach it to the Connect Context for the handler to consume.

### Security Assumptions
- All user-identifiable IDs are generated unpredictably (KSUID or NanoID) to prevent enumeration.
- No roles can be escalated without an existing 'admin' invoking the command.
- Hard fail mechanism: If `X-Organization-ID` is present but the user's membership record is missing, return 403 Forbidden.

### Alternative Considered
- Using fully stateless JWTs. We chose stateful sessions (with a `sessions` table) to allow immediate revocation of CLI tokens or compromised browser sessions without waiting for expiration. (Wait, the scope above says Bearer JWT. Let's stick to short-lived stateless JWTs to remain lightweight, with refresh tokens optionally added later if needed).

## Decision Record
- **Approved**: Use standard Google OAuth.
- **Approved**: Use `organization_members` join table for Role representation.
- **Approved**: TypeSpec definition inside `packages/shared-contract`.
