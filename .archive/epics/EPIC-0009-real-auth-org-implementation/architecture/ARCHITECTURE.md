# Architecture Design: Real Auth & Org Implementation

## Overview
This document specifies the architectural changes required to replace the mocked `AuthService` and `OrgService` within `apps/backend/index.ts`.

## Components Modified
- `apps/backend/index.ts`: The Connect-RPC server handler logic.

## Data Access Strategy (CQRS Write Path)
1. **AuthService.getIdentity**: For MVP simulation without the OAuth middleware providing `req.userId`, we will query the `users` table for returning a valid user payload. If none exists, an error is returned.
2. **OrgService.seedOrg**: We will `.insert()` a new record into `organizations` and immediately another into `organizationMembers` mapping a user as 'admin'.
3. **OrgService.listOrgs**: Perform a simple `.select()` on `organizations`.
4. **OrgService.inviteUser**: Perform an `.insert()` into `invitations`.

## Observability & Errors
- Use native Drizzle operations for SQLite vs MySQL dynamically switching based on the `isStandalone` flag.
