# API Architecture Standards

This document outlines the strict guidelines for designing, exposing, and consuming APIs within the project, ensuring consistency across all backend endpoints.

## 1. RESTful Endpoints & Resource Naming
- **Nouns, not Verbs**: Endpoints must represent resources (e.g., `/api/v1/workspaces`, not `/api/v1/getWorkspaces`). Actions on resources should use appropriate HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- **Pluralization**: Resource names should always be plural to ensure consistency (`/users`, `/tasks`, `/organizations`).
- **Nesting Level Limit**: Do not deeply nest relational endpoints. Limit nesting to one level of depth (e.g., `/workspaces/{id}/tasks`). For deeper hierarchical access, query the sub-resource directly with a filter (e.g., `/tasks?workspaceId={id}`).

## 2. Standardized JSON Envelope
- **The Wrapper**: All API responses (success and error) must be wrapped in a predictable, top-level object. Do not return bare arrays or primitive types.
  ```json
  {
    "data": { ... }, // The actual requested payload (Array or Object)
    "meta": { ... }  // Optional metadata (pagination, cursors, request IDs)
  }
  ```
- **Error Shape**: Error responses must follow a strict, unified problem details format (similar to RFC 7807) under an `error` key instead of `data`.

## 3. Correct HTTP Status Codes
- **Rule**: Map your logical application results to standard HTTP semantics accurately.
- **Success Modes**: 
  - `200 OK` (Standard success)
  - `201 Created` (Returned strictly after a successful `POST` that creates a new record)
  - `204 No Content` (For successful `DELETE` or empty `PUT` updates)
- **Error Modes**: 
  - `400 Bad Request` (Zod validation failures, malformed syntax)
  - `401 Unauthorized` (Missing or invalid auth token)
  - `403 Forbidden` (RBAC failure; valid user but insufficient permissions)
  - `404 Not Found` (Resource does not exist)
  - `409 Conflict` (Duplicate record creation, optimistic locking failures)

## 4. API Versioning
- **URI Versioning**: Standard REST APIs must begin with an explicit version namespace (e.g., `/api/v1/...`). 
- **Breaking Changes**: A new version (`v2`) must be created if there are any backwards-incompatible contract changes (e.g., removing a field, changing a field type). Adding optional fields is considered non-breaking.

## 5. Pagination & Cursors
- **Default Limits**: List endpoints must never return unbounded data. Default to a reasonable limit (e.g., 20 or 50 items).
- **Cursor-based Preference**: Prefer cursor-based pagination (`?cursor=xyz&limit=20`) over offset-based (`?page=2&limit=20`) for massive datasets or real-time feeds to prevent data-skipping anomalies.
- **Standard Query Params**: Use `limit` and `cursor` consistently across the entire API surface.
