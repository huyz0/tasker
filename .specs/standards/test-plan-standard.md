# Test Plan Standard

This document outlines the strict standard for defining, scaffolding, and managing test plans and their associated test cases within the project. Robust test documentation ensures quality, prevents regressions, and validates that Epics meet their Definition of Done.

## 1. Storage and Location
- **Directory**: All test plans MUST be stored in the `.test-plans/` directory at the root of the project. This keeps them adjacent to code but distinct from the high-level `.epics/`.
- **Folder Structure**: Each test plan MUST be contained within its own folder.
- **Folder Naming Convention**: `TEST-PLAN-<id>-<kebab-case-title>` (e.g., `TEST-PLAN-0001-user-auth-flows`).
- **File Name**: The main definition file inside the folder MUST be explicitly named `TEST-PLAN.md`.

## 2. File Format and Metadata
- **Markdown**: The `TEST-PLAN.md` file MUST be written in Markdown.
- **YAML Frontmatter**: Every `TEST-PLAN.md` file MUST contain YAML frontmatter at the top of the document to provide essential metadata.
- **Required Metadata Fields**:
  - `status`: The current state of the test plan. Allowed values: `draft`, `review`, `active`, `obsolete`.
  - `title`: The human-readable title of the test plan.
  - `epic_link`: The ID of the Epic this test plan validates (e.g., `EPIC-0001`).
  - `author`: The person or team responsible for planning the tests.
  - `created_at`: The creation date (YYYY-MM-DD).

## 3. Required Test Plan Structure
To ensure comprehensive test planning, the `TEST-PLAN.md` file MUST follow this exact robust structure:

### 1. Context & Objective
Briefly describe what is being tested. Reference the specific feature, component, or Epic. What are the key risk areas?

### 2. Scope of Testing
- **In Scope**: Functionality, flows, and edge cases to heavily target (e.g., Backend endpoints, UI error states).
- **Out of Scope**: Functionality explicitly skipped in this cycle (e.g., Load testing handled separately, UI pixel-perfection).

### 3. Test Strategy & Environment
Define the testing pyramid approach and setup needs:
- **Unit/Integration**: Which components will rely purely on automated tests?
- **E2E/UI**: What critical user journeys require Playwright/Cypress coverage?
- **Manual QA**: If manual testing is needed, what specific exploratory paths should be checked?
- **Environment Setup**: Data seeding requirements, mock dependencies, or staging environments needed.

### 4. Test Cases
Enumerate explicit test scenarios. Each scenario must use a clear Given/When/Then (BDD) style format, or Step/Expected Result format. Let's use `TC-XXX` as identifiers.

#### Test Case Format Example
**TC-001: Successful Login**
- **Type**: Automation / E2E
- **Given**: A user exists with a registered email "test@test.com"
- **When**: The user submits valid credentials on the `/login` route
- **Then**: The system sets a valid JWT cookie and redirects to `/dashboard`

## 4. Version Control
- **Git Managed**: Just like code and Epics, test plans MUST be committed to the repository to track how testing evolved alongside the system architecture.

## Example `TEST-PLAN.md` Skeleton

```markdown
---
status: draft
title: User Authentication Validation
epic_link: EPIC-0001
author: Quality Chapter / Auto
created_at: 2026-03-30
---

# User Authentication Validation

## Context & Objective
Validating the primary login and authentication module introduced in EPIC-0001 to ensure users can securely access their accounts and tokens are handled correctly.

## Scope of Testing
### In Scope
- Core login/logout flows.
- JWT token expiry and refresh mechanics.
- Form validation limits.

### Out of Scope
- OAuth integrations (Google/Github).
- Rate limit testing (DDoS scenarios).

## Test Strategy & Environment
- **Automation Heavy**: Business logic for token issuing relies on dense backend Unit Tests (Vitest).
- **E2E Critical Path**: Playwright tests to actually click through the UI login form.
- **Data Needed**: Seed the local DB with 1 valid user and 1 banned user before the E2E suite runs.

## Test Cases

### TC-001: Correct Credentials Issue Secure Session
- **Type**: E2E
- **Given**: A non-banned existing user is on the login view.
- **When**: They submit correct email and password.
- **Then**: An HttpOnly JWT cookie is set and the user lands on the dashboard.

### TC-002: Invalid Credentials Show Error
- **Type**: Unit/E2E
- **Given**: A user is on the login view.
- **When**: They submit a bad password.
- **Then**: The backend returns 401 Unauthorized, and the UI displays "Invalid credentials" without clearing the email field.
```
