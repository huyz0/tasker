---
epic: EPIC-0015
title: "TEST PLAN — Repository Integration and Auth"
status: draft
created_at: 2026-04-23
---

# TEST PLAN — Repository Integration and Auth

## Scope & Objective
Ensure that users can securely link their Tasker projects to external repositories (GitHub / Bitbucket), and that remote Pull Requests sync correctly and display inline with Tasker Tasks.

## Test Scenarios

### Scenario 1: OAuth Linking Flow (Golden Path)
- **Given** I am a Project Admin on the Integration settings page,
- **When** I click "Add Repository Link" and authorize via GitHub successfully,
- **Then** my access token is securely encrypted and stored,
- **And** the UI lists the connected GitHub repositories I have access to.

### Scenario 2: OAuth Failure / Rejection
- **Given** I am initiating the OAuth handshake,
- **When** I click "Cancel/Decline" on the GitHub authorization page,
- **Then** I am safely redirected back to Tasker,
- **And** a destructive toast displays "Authorization cancelled."
- **And** no token or repository links are created in the database.

### Scenario 3: Bad/Stale Tokens (Graceful Degradation)
- **Given** I have an established repository link,
- **When** I revoke the Tasker OAuth APP from inside my GitHub settings,
- **And** the `SyncPullRequests` job attempts to fire,
- **Then** the job gracefully fails without crashing the event loop,
- **And** the UI Integration tab displays "Integration broken: Re-authentication required."

### Scenario 4: PR Sync Execution
- **Given** a connected Repository has a Pull Request `#125` mentioning `Task-125`,
- **When** the `SyncPullRequests` command is dispatched,
- **Then** `remote_pull_requests` is updated with PR `#125` status (`Open`).
- **And** the `PullRequestsSynced` event is published to NATS.

### Scenario 5: Task UI PR Badge Render
- **Given** a synced PR (`Open` state) is mapped to Task `125`,
- **When** I navigate to the Task Workbench to view Task `125`,
- **Then** I see a "Pull Requests" section containing a green "Open" badge indicating PR `#125`.
- **And** clicking the badge opens the external PR correctly in a new tab.

## Security & Verification Checks
- `Vitest` integration test proving that when fetching tokens from the DB via `Drizzle`, they are properly decrypted via the `APP_ENCRYPTION_SECRET`.
- `Playwright` E2E test verifying the UI components for Repository configuration load securely without flashing any raw tokens to the client browser.
