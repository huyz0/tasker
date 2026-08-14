---
status: draft
title: Repository Integration and Auth
epic_link: EPIC-0015
author: AI Agent
created_at: 2026-04-23
---

# Test Plan: Repository Integration and Auth

## 1. Context & Objective
This test plan covers the integration of Tasker with external version control platforms (GitHub and Bitbucket). The critical risk areas include secure OAuth token handling (AES encryption), SSRF prevention during external API calls, and accurate rendering of remote Pull Request statuses within the Task Workbench.

## 2. Scope
- **In Scope**: OAuth callback processing, token encryption/decryption, database storage of Repository links, manual and cached PR syncing, UI rendering of PR badges, and CLI commands.
- **Out of Scope**: Automated webhook processing (deferred to Phase 2), code editing capabilities.

## 3. Test Strategy & Environment
- **Unit/Integration**: Vitest suites for backend handlers (`RepositoriesHandler`), Drizzle schema validation, and AES encryption utility functions. MSW will mock external provider APIs (e.g. GitHub REST).
- **E2E/UI**: Playwright journeys for the OAuth redirect flow (mocked callback) and rendering PR badges on the Task Details page.
- **Environment Setup**: In-memory `bun:sqlite` for fast integration tests; mocked `fetch` interceptors for GitHub/Bitbucket.

## 4. Test Cases

### TC-001: OAuth Linking
- **Type**: Integration
- **Given**: A Project Admin on `/api/auth/github/repo-link`
- **When**: The external provider redirects back with a valid OAuth `code`
- **Then**: The backend exchanges the code, encrypts the access token, inserts a `repositories` record, and redirects back to the UI Settings page.

### TC-002: Token Encryption at Rest
- **Type**: Unit
- **Given**: An incoming OAuth access token `gho_dummy_token`
- **When**: The `CreateRepositoryLink` command executes
- **Then**: The database strictly stores the AES-encrypted cipher string, never plain text.

### TC-003: PR Synchronization (Cache Miss)
- **Type**: Integration
- **Given**: A Task linked to a Project with an active Repository
- **When**: A user queries `GetPullRequestsForTask` and the cache is older than 5 minutes
- **Then**: The backend decrypts the token, calls the GitHub API, updates the `pull_requests` cache table, and returns the fresh list.

### TC-004: SSRF Prevention
- **Type**: Unit
- **Given**: A `SyncPullRequests` worker processing a repository
- **When**: The repository's `remoteRepoId` contains malicious path traversal characters (e.g., `../../api/internal`)
- **Then**: The Zod validation layer rejects the input instantly before any `fetch` request is dispatched.

### TC-005: CLI PR Listing
- **Type**: E2E (CLI)
- **Given**: A developer executing `tasker repo list --task-id 123 --json`
- **When**: The CLI authenticates via Connect-RPC
- **Then**: It outputs a strictly structured JSON array of Pull Request objects without extraneous terminal colors.
