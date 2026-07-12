# Tasker: Backend Core Services

This is the primary Tasker API server, built on top of **Bun.js** for high performance and strict TypeScript enforcement. It powers the autonomous AI agents structure, artifacts metadata, and task-state transitions.

## Getting Started

### Prerequisites
- *See the main workspace [README](../../README.md) for global `moonrepo` and toolchain (`proto`) installation instructions.*

### Development
Start the local server with hot reload:
```bash
bun run dev
```
*(By default, this command maps to running `index.ts` through Bun's internal fast execution)*

### Production Run
```bash
bun run index.ts
```

## Architecture
- **Contracts**: This backend implements the explicit contracts maintained in the `packages/shared-contract` TypeSpec schemas.
- **Protocol**: Exposes services via the `ConnectRPC` protocol, ensuring safe, strongly typed interactions with both the GUI frontend and the Go CLI.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `STANDALONE` | `"true"` selects the embedded SQLite path (single-bundle mode); unset/false uses MySQL via `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`. |
| `JWT_SECRET` | Signs session tokens. **Required in production** - the server refuses to start with the default value when `NODE_ENV=production`. |
| `APP_ENCRYPTION_SECRET` | Encrypts stored repository access tokens (AES-256-GCM). **Required in production**, same fail-fast behavior. |
| `NODE_ENV` | `development` \| `production` \| `test`. Production enables the stricter config checks above. |
| `ENABLE_TEST_LOGIN` | Enables `/api/auth/test/inject` for minting a session without real OAuth. **Must not be enabled in production** - the server refuses to start otherwise. Only use for local dev/smoke testing. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth login (used by both the GUI and `tasker auth login`). |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth consumer for linking repositories. |
| `BITBUCKET_CLIENT_ID` / `BITBUCKET_CLIENT_SECRET` | Bitbucket Cloud OAuth consumer for linking repositories via the OAuth flow. Not needed for the direct-API-token linking path (Basic auth with an Atlassian API token), which requires no server-side consumer setup. |
| `NATS_URL` | Domain event bus connection (non-fatal if unreachable - the backend logs and continues without it). |
| `LOG_LEVEL` | Pino logger level. |

The backend always listens on port `8080`.
