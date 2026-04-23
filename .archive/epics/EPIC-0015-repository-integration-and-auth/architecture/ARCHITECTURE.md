# Architecture: Repository Integration and Auth

## 1. Context
`EPIC-0015` introduces external repository linking to Tasker. By authenticating with GitHub and Bitbucket Cloud via OAuth, Tasker can sync Pull Requests and map them to internal tasks, granting AI agents and users full context on code deployments.

## 2. Bounded Context: `Repositories`
This epic introduces a new Domain-Driven Design (DDD) bounded context called `Repositories`.

### Entities & Value Objects
- **`Repository`**: Represents a linked external repository.
  - `id`: UUID
  - `projectId`: UUID (foreign key to Projects)
  - `provider`: Enum (`GITHUB`, `BITBUCKET`)
  - `remoteRepoId`: String (ID or full name in the external provider)
  - `accessToken`: String (AES-256 encrypted OAuth token)
  - `createdAt`, `updatedAt`

- **`PullRequest`**: A cached copy of a remote PR linked to a Task.
  - `id`: UUID
  - `repositoryId`: UUID
  - `taskId`: UUID
  - `remotePrId`: String
  - `remotePrNumber`: Integer
  - `title`: String
  - `status`: Enum (`OPEN`, `MERGED`, `CLOSED`)
  - `url`: String
  - `author`: String

### Command-Query Responsibility Segregation (CQRS)
- **Commands**:
  - `CreateRepositoryLink`: Establishes the OAuth connection and saves the encrypted token.
  - `UnlinkRepository`: Deletes the link and revokes the token if possible.
  - `SyncTaskPullRequests`: Triggered to fetch the latest PR state for a given task/repo.
- **Queries**:
  - `ListRepositories`: Returns repositories linked to a project.
  - `GetPullRequestsForTask`: Retrieves cached PRs for a task to be rendered in the UI.

## 3. Data Flow
1. **OAuth Flow**: The frontend redirects the user to `/api/auth/{provider}/repo-link?projectId={id}`. The backend orchestrates the OAuth handshake, receives the access token, encrypts it, and stores it in the `repositories` table.
2. **Synchronization**: A cron-based worker or manual `SyncPullRequests` command invokes the external provider's API (e.g., GitHub REST API) using the decrypted token. It parses PRs, searches for Tasker Task IDs in titles/bodies, and updates the `pull_requests` table.
3. **Event Bus**: Upon PR sync, a Domain Event `PullRequestsSynced` is published to NATS, allowing other domains (e.g., UI WebSockets or Agent triggers) to react.

## 4. Security & Compliance
- **Token Encryption**: Access tokens MUST be encrypted at rest using `aes-256-gcm` with a master key derived from environment variables.
- **SSRF Prevention**: Strict validation of remote provider endpoints. No user-supplied URLs are fetched directly; only hardcoded provider base URLs (e.g., `api.github.com`).
- **Read-Only Scope**: OAuth scopes requested MUST be strictly read-only.
