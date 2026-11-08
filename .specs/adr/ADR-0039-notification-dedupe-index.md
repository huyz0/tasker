---
id: ADR-0039
status: accepted
date: 2026-11-08
milestone: M45
---

# Fit notification deduplication into MySQL's index limit

## Context

Real MySQL 8.4 boot fails under its default utf8mb4 charset: the notification
unique index covers 896 characters, requiring up to 3584 bytes where InnoDB
allows 3072. SQLite-only tests never exercised this. A later migration cannot
repair a fresh database whose earlier CREATE never succeeds.

## Options

1. Shorten dedupe keys or make a prefix index permanent. Both reject previously
   valid inputs or falsely collapse distinct long keys.
2. Change database-wide charset. This loses Unicode support and makes deployment
   configuration hide a schema defect.
3. Index a generated binary SHA-256 of the full key and preserve the original.
   This fits the index limit and retains full-key equality at the accepted
   cryptographic collision bound.

## Decision

Use a stored generated binary digest for notification uniqueness and retain
all 512 characters of the source key.

## Consequences

- The historical CREATE receives a temporary 384-character prefix index so
  clean utf8mb4 boot can reach the forward migration. This is an intentional
  bootstrap repair; existing databases do not rerun that CREATE.
- Migration 0047 replaces the index with the full-key digest for both old and
  new databases before request serving starts. Source keys are not truncated.
- Equal full keys still conflict; keys differing beyond character 384 do not.
  Unicode keys remain supported. Digest equality is byte-based, matching
  SQLite's default key equality rather than folding case/accent variants.
- The existing user/type collation is unchanged. Hash collision risk is the
  standard SHA-256 bound, also used elsewhere for request identity.
- This does not make MySQL DDL transactional or automatically repair a database
  interrupted halfway through an older migration. Such databases require
  inspection and operator-directed reconciliation; no data is dropped here.
