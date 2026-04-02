---
status: done
designs:
  architecture: completed
  ux: n/a
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: n/a
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-02
---

# Real Auth & Org Implementation

## Context & Objective
Tasker requires multi-tenant isolation and user identities. Currently, `AuthService` and `OrgService` provide mock configurations in the development server. To complete the MVP foundation, we must swap these mocked services with concrete Drizzle ORM operations accessing the underlying database schemas.

## Scope
### In Scope
- Connect `AuthService.getIdentity` to the real database to return the active authenticated user matching the mocked or requested state.
- Connect `OrgService.listOrgs`, `OrgService.seedOrg`, and `OrgService.inviteUser` to perform true CRUD against Drizzle tables (`organizations`, `organization_members`, `invitations`).
- Maintain isolated Drizzle setups between SQLite and MySQL modes.
- Publish NATS domain events (`domain.org.created`).

### Out of Scope
- OAuth logic (already mocked or bypassed successfully via prior epics for the testing suite, so we simply align the final data endpoints).
- UI/UX updates.

## Dependencies
- EPIC-0004 (Provided the schemas).

## Technical Approach
- Using `schemaSqlite` or `schemaMysql` based on `isStandalone`.
- `seedOrg`: Perform an insert into `organizations`, followed by an insert into `organizationMembers` mapping the user as "admin".

## Definition of Done
- `AuthService` and `OrgService` contain strictly Drizzle-backed operations.
- Backend tests successfully process transactions verifying these endpoints.

## Task Breakdown
- [x] Implement `getIdentity` in `AuthService` mapping to `users`.
- [x] Implement `listOrgs` in `OrgService` fetching from `organizations`.
- [x] Implement `seedOrg` transaction/insertions for both `organizations` and `organization_members`.
- [x] Implement `inviteUser` pointing to the `invitations` table.
