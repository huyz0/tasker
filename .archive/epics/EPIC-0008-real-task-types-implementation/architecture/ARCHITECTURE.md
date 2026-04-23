# Architecture Design: Real Task Types Implementation

## Overview
This document specifies the architectural changes required to replace the mocked `TaskTypeService` in `apps/backend/index.ts` with real database queries.

## Components Modified
- `apps/backend/index.ts`: The Connect-RPC server handler logic.

## Data Access Strategy (CQRS Write Path)
1. In `getTaskType`, we will use Drizzle ORM to perform a `.select()` query targeting either `schemaSqlite.taskTypes` or `schemaMysql.taskTypes` depending on the `isStandalone` environment variable.
2. In `createTaskType`, we will use an `.insert()` query and immediately publish the `domain.task_type.created` message via NATS.

## Observability & Errors
- Failed reads (not found) must return a Connect error with `Code.NotFound`.
- Both `sqlite` and `mysql` dialect variations will be fully handled dynamically using the active `db` object in the router.
