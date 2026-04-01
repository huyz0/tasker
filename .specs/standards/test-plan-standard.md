# Test Plan Standard

## 1. Storage & Organization

- **Path**: `.test-plans/` directory.
- **Folder Format**: `TEST-PLAN-<id>-<kebab-case-title>` (e.g.,
  `TEST-PLAN-0001-user-auth`).
- **File Name**: `TEST-PLAN.md`.

## 2. Metadata (YAML Frontmatter)

Requires:

- `status`: `draft`, `review`, `active`, `obsolete`.
- `title`: Human-readable name.
- `epic_link`: ID of Epic validated (e.g., `EPIC-0001`).
- `author`: Person/Team.
- `created_at`: YYYY-MM-DD.

## 3. Structure

### 1. Context & Objective

Feature tested and key risk areas.

### 2. Scope

- **In Scope**: Targeted functionality/flows.
- **Out of Scope**: Explicit skips.

### 3. Test Strategy & Environment

Define test pyramid setup:

- **Unit/Integration**: Backend handlers, Core components.
- **E2E/UI**: Critical Playwright user journeys.
- **Manual QA**: Exploratory paths.
- **Environment Setup**: DB seeds, mocked APIs.

### 4. Test Cases

Explicit `TC-XXX` scenarios using Given/When/Then. **Format**: **TC-001: Login**

- **Type**: Automation / E2E
- **Given**: Registered user on `/login`
- **When**: Submits valid credentials
- **Then**: HTTP Cookie Set + `/dashboard` redirect

## 4. Version Control

- **Git Managed**: Commit test plans to repository alongside code to track
  coverage evolution.
