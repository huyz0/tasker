# ADR 0002: Remote API Sync Strategy
- **Date**: 2026-04-23
- **Epic**: EPIC-0015

## Context
When displaying Tasks in Tasker, users should immediately see visual badges noting the status (e.g. "Draft", "Open", "Merged", "Closed") of any linked Pull Requests on external repositories. Displaying this data requires bridging external provider networks with Tasker's internal UI request cycle.

## Decision
Tasker will strictly decouple external VCS API fetching from UI Read operations by employing Background Fetching via CQRS Commands (`SyncPullRequests`). The REST/GraphQL call to GitHub/Bitbucket will only be executed by a background job or explicit user "Refresh" command. The retrieved metadata is fully stored in the MySQL `remote_pull_requests` table. UI queries will exclusively read from OpenSearch/MySQL and never proxy the HTTP call inline.

## Rationale
Proxied inline fetching exposes the end-user request latency directly to GitHub's API response times. Because AI Agents might attempt to load thousands of tasks containing hundreds of PR linked badges, proxying the requests online guarantees rate limits, token exhaustion, and context window timeouts. Storing the metadata internally mitigates all external latency and respects CQRS/DDD boundaries by mutating state explicitly. 

## Consequences
- **Positive:** Tasker UI and API Gateway remain incredibly fast and immune to GitHub/Bitbucket outages or rate limits.
- **Negative:** PR status badges might temporarily display stale data until the sync job or user refresh explicitly fetches the remote differential.
