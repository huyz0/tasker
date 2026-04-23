# ADR 0001: OAuth Token Storage and Encryption
- **Date**: 2026-04-23
- **Epic**: EPIC-0015

## Context
When a user links their Tasker project to a remote GitHub or Bitbucket Cloud repository, Tasker requests an OAuth integration and receives a sensitive, long-lived Access Token enabling read capabilities. Storing this token in plain text poses a severe security risk if the primary database is compromised. 

## Decision
All OAuth access tokens will be encrypted prior to database insertion using AES-256-GCM symmetric encryption. 

## Rationale
Following Tasker's tech-stack portability principles, relying on an external Secrets Manager (like AWS KMS or HashiCorp Vault) inherently breaks the `single-bundle portable deployment` goal for local runtimes. Therefore, application-level encryption must be used. We will rely on built-in Node.js `crypto` primitives exposed in Bun, utilizing a single `APP_ENCRYPTION_SECRET` securely provided at runtime via `process.env` or `.env`.

## Consequences
- **Positive:** Read-only OAuth tokens are secured against basic SQL injection exfiltration and database backup theft.
- **Negative:** If developers lose their `APP_ENCRYPTION_SECRET`, all stored integration links will immediately break and require the user to re-authenticate with the remote providers.
