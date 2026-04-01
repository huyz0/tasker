# API Architecture Standards

## 1. RESTful Endpoints

- **Nouns, not Verbs**: Use resources (`/api/v1/workspaces`), not verbs
  (`/getWorkspaces`). Use standard HTTP verbs (`GET`, `POST`, `PUT`, `PATCH`,
  `DELETE`).
- **Pluralization**: Force plural resource names (`/users`, `/tasks`).
- **Nesting Limit**: Max 1 level depth (`/workspaces/{id}/tasks`). For deeper
  traversal, filter flat resources: `/tasks?workspaceId={id}`.

## 2. Standardized JSON Envelope

- **Wrapper**: Wrap all responses in `{ data: any, meta?: any }`. Never return
  bare primitives or arrays.
- **Error Shape**: Format errors via strict RFC 7807 problem details inside
  `error` key (omit `data`).

## 3. HTTP Status Codes

- `200 OK`: Standard success.
- `201 Created`: ONLY after successful `POST`.
- `204 No Content`: Successful `DELETE` or empty `PUT`.
- `400 Bad Request`: Validation/Zod failures.
- `401 Unauthorized`: Missing/invalid token.
- `403 Forbidden`: RBAC failure (valid token, unauthorized action).
- `404 Not Found`: Resource missing.
- `409 Conflict`: Duplicates or locking failures.

## 4. Versioning

- **URI Versioning**: Require namespace (`/api/v1/...`).
- **Breaking Changes**: Require new version (e.g., `v2`). Optional fields are
  non-breaking.

## 5. Pagination & Cursors

- **Limits**: Cap list endpoints (e.g., 20 or 50 items max). No unbounded data.
- **Cursors**: Prefer cursor-based (`?cursor=xyz&limit=20`) over offset-based
  (`?page=2`).
- **Params**: Consistently use `limit` and `cursor`.
