---
status: done
designs:
  architecture: completed
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: approved
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
---

# Authentication & Organization Management

## Context & Objective
As Tasker is designed for secure, multi-tenant collaboration between AI agents and humans, a robust identity and access management system is essential. The objective of this epic is to lay the foundation for Authentication (Google OAuth 2.1) and Organization Management (multi-tenancy). This implements the initial seed setup for admins and standard users, allowing secure access to the GUI and establishing verifiable identities for the CLI.

## Scope
### In Scope
- Setup Google OAuth 2.1 integration within the Bun backend for user login.
- Establish `users`, `organizations`, and `sessions` database schemas via Drizzle ORM.
- Implement the "Seed Admin" setup flow (first user creation).
- Allow inviting new users by email (basic invitation records).
- Setup the core permission model (org admin vs normal user).
- Define TypeSpec `AuthService` and `OrgService` contracts.
- Connect the React GUI to the new auth flow (Login page, redirect callbacks, protected routes).
- Add `tasker login` to the Go CLI using local redirect flow and secure token storage.

### Out of Scope
- Advanced Role-Based Access Control (RBAC) beyond simple "Admin" vs "User".
- Integration with external non-Google SSO providers (SAML, OIDC).
- Implementing Agent M2M API keys (deferred to a dedicated Agent Identity epic).
- Handling billing or subscription features.

## Dependencies
- EPIC-0002 (Completed) - Relies on the established Drizzle/MySQL and Connect-RPC foundations.

## Technical Approach
- **Database**: Add `users`, `organizations`, and `organization_members` tables. We will enforce multi-tenancy at the query level by ensuring subsequent domain accesses (Projects, Tasks) require an `org_id`.
- **Backend (Bun)**: Implement Google OAuth standard flow. Upon successful callback, issue a secure HttpOnly cookie for GUI clients, and return a Bearer JWT/token payload for CLI clients.
- **Contract**: `AuthService.loginCallback`, `AuthService.getIdentity`, `OrgService.listOrgs`.
- **Frontend (GUI)**: Utilize a global Auth Context in React. Use React Router loaders to protect routes, redirecting unauthenticated users to `/login`.
- **Client (CLI)**: Use a local OAuth callback listener on a random port to capture the Google redirect and store the resulting token in the OS keychain (or encrypted local config).

## Definition of Done
- `users` and `organizations` migrations applied successfully.
- User can click "Login with Google" on the GUI, authenticate, and see their profile data.
- CLI user can run `tasker login`, authenticate via browser, and successfully ping an authenticated backend route.
- A user can invite another user via email, who can then log in and join the Organization.
- All new TypeSpec endpoints are fully type-checked and compiled into Go and TS clients.
- Security review confirms that JWTs/Sessions are verified securely on every request using proper middleware on the Bun backend.

## Task Breakdown
- [x] Define `users`, `organizations`, `organization_members`, and `invitations` schemas in Drizzle (`apps/backend`).
- [x] Define `AuthService` and `OrgService` in `packages/shared-contract/main.tsp`.
- [x] Implement Google OAuth route handlers in `apps/backend`.
- [x] Implement Session Middleware in the Connect-RPC server to extract and validate tokens/cookies.
- [x] Implement the React Login page, global Auth Provider, and Protected Route wrapper (`apps/gui`).
- [x] Implement the `cli login` command with a local browser redirect receiver (`apps/cli`).
- [x] Create basic backend routes for inviting users to an org.
- [x] Create simple GUI screens for viewing the current Org and its members.
