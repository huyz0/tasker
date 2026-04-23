# ADR 0002: General Query Builder Implementation
- **Date**: 2026-04-03
- **Epic**: EPIC-0013

## Context
Each bounded context currently risks implementing proprietary filtering and sorting algorithms mapping query strings to Drizzle ORM calls, creating duplication, security risks (unvalidated sort fields), and maintenance debt.

## Decision
Create a centralized, type-safe `QueryBuilder` utility in `src/infrastructure/database/` that parses a Zod-validated generic schema mapping of filters/sorts directly into standard Drizzle ORM operations. 

## Rationale
Centralizing read-model filtering reduces boilerplate per handler by roughly 40%, enforces a project-wide authorization and validation standard seamlessly, and abstracts the SQL dialect away from the business layer.

## Consequences
- **Positive:** Maximum code reuse for discovery features. Central security layer for data extraction.
- **Negative:** Potentially inflexible for highly asymmetrical custom joins or complex nesting, which may require fallback specialized custom handlers later.
