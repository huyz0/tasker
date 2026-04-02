# QA Plan: Real Auth & Org Implementation

## Overview
The goal of this test plan is to verify that `AuthService` and `OrgService` interact properly with internal sqlite schemas.

## Scenarios

### Scenario 1: Seed Organization
**Given** an authenticated user request to seed an organization
**When** the user calls `seedOrg` with a valid name and slug
**Then** the service should insert an org into `organizations` table
**And** an entry under `organization_members` should associate them as `admin`.

### Scenario 2: Identity Lookup
**Given** the test environment supplies a mock ID context
**When** the user calls `getIdentity`
**Then** the database retrieves the user attributes from the `users` table.

### Scenario 3: Invitations
**Given** a valid organization id and token
**When** `inviteUser` is called with an email
**Then** the `invitations` table sees a new row created correctly.
