# ADR 001: Pull Request Synchronization Strategy

## Context
Tasker needs to display external Pull Requests from GitHub and Bitbucket on internal Tasks. We must decide how this data is synchronized from the external providers into our system.

## Options Considered

### Option 1: Webhook-Driven (Push)
Register webhooks on the external repositories to receive push notifications whenever a PR is created or updated.
- **Pros**: Real-time updates; highly efficient (no empty polling).
- **Cons**: Requires exposing a public webhook receiver, which is difficult for zero-config portable local deployments. High complexity in managing webhook lifecycles per repository.

### Option 2: Periodic Polling (Pull)
Run a backend cron job to periodically fetch the latest PRs for all linked repositories.
- **Pros**: Easy to implement. Works in local isolated environments without public ingress.
- **Cons**: Latency between remote changes and local display; potential API rate-limit exhaustion at scale.

### Option 3: On-Demand Manual Sync (Hybrid Pull)
Fetch and update PR status dynamically when a user views a Task, augmented by a manual "Sync" button, caching the result.
- **Pros**: Lowest rate-limit consumption; perfectly suits portable local mode; guarantees fresh data when a user or agent is actively looking.
- **Cons**: Requires the user/agent to trigger the read; slightly higher latency on page load.

## Decision
We will implement **Option 3: On-Demand Manual Sync (Hybrid Pull)** for Phase 1.

When a user opens a Task, or an AI Agent queries a Task, a `SyncTaskPullRequests` command is dispatched asynchronously to refresh the PR state if the cache is stale (e.g., older than 5 minutes). Additionally, a manual "Sync" button will bypass the cache.

This avoids the complexity of webhook management for portable deployments while mitigating the rate-limiting risks of brute-force periodic polling across thousands of repositories.

## Consequences
- The system must implement a caching layer (via DB `updatedAt` timestamps) to prevent spamming GitHub/Bitbucket APIs on every UI render.
- Real-time instant updates will not appear unless triggered by a page refresh or manual sync.
