# Test Plan: Authentication & Organization Management (EPIC-0004)

## Quality Assurance Scenarios

### 1. Authentication Component (`apps/backend`, `apps/gui`)

**Scenario 1.1: Valid Google Auth Login**
- **Given** a user navigates to the login page
- **When** they complete Google OAuth successfully
- **Then** their browser receives an HttpOnly Session Cookie and they are redirected to `/dashboard`.

**Scenario 1.2: Protected Route Enforcement**
- **Given** an unauthenticated visitor
- **When** they attempt to load a protected route (e.g., `/settings` or `/dashboard`)
- **Then** they are immediately redirected back to `/login`.

### 2. Organization Onboarding (`apps/backend`, `apps/gui`)

**Scenario 2.1: Seed Organization Creation**
- **Given** a new user logging in for the absolutely first time (no records exist)
- **When** they complete Google Auth
- **Then** the system diverts them to the "Create Workspace" onboarding step instead of a blank dashboard.

**Scenario 2.2: User Invitation Acceptance**
- **Given** an existing organization admin creates an invite for `test@example.com`
- **When** `test@example.com` logs in with the matching email and the invite code
- **Then** they are automatically added to the `organization_members` table as a `member`.

### 3. Multi-Tenancy Segregation

**Scenario 3.1: Enforce X-Organization-ID**
- **Given** a logged-in user who belongs to Org A but not Org B
- **When** they attempt to execute an API command (e.g., `list_projects`) asserting `X-Organization-ID = <Org B>`
- **Then** the Connect-RPC Interceptor forcibly rejects the RPC call with a `PermissionDenied` error.

### 4. CLI Interaction (`apps/cli`)

**Scenario 4.1: CLI Login Flow**
- **Given** a user opens a terminal
- **When** they run `tasker auth login`
- **Then** a local HTTP listener starts, a browser window opens, authentication completes, and the user's `session_token` securely writes to the local keychain/config.

## Automation & Tools
- **Unit Tests**: Coverage for `AuthService` JWT generation/validation rules using Vitest (`apps/backend`).
- **E2E UI Tests**: Playwright scripts rendering the Shadcn login card and verifying client-side routing logic (mocking the actual OAuth provider response).
