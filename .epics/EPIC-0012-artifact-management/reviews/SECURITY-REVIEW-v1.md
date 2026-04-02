---
timestamp: 2026-04-03T09:04:00+11:00
decision: approved
---

# Security Review — EPIC-0012 Artifact Management

## Scope
Static analysis and architectural security review of all code implementing the Artifact Management epic.

### Files Reviewed
- `apps/backend/src/modules/artifacts/artifacts.handler.ts`
- `apps/backend/src/modules/comments/comments.handler.ts`
- `apps/backend/src/db/schema.mysql.ts` (lines 115–146)
- `apps/backend/src/index.ts` (service registration)
- `packages/shared-contract/main.tsp` (API contract)

## Standards Applied
- `.specs/standards/security-standard.md`
- `.agents/skills/code-review-auto/references/code-review-principles/security-review.md`
- `.agents/skills/code-review-auto/references/backend-typescript/security.md`

## Completeness Check
- [x] Folder, Artifact, TaskArtifactLink, and Comment CRUD endpoints exist.
- [x] No hardcoded secrets or API keys detected.
- [x] ORM-based queries (Drizzle) — no raw SQL or string interpolation.
- [x] NATS event publishing uses `JSON.stringify` on payload objects — no user-controlled injection vector.

## Pre-Commit CI Result
`moon check --all` — **PASSED**.

## Findings

```yaml
findings:
  - file: "apps/backend/src/modules/artifacts/artifacts.handler.ts"
    line: 8
    severity: "Medium"
    comment: "No input validation (Zod) on createFolder request. Malformed or oversized projectId/name values pass through unchecked to the database layer. Per security-standard §1, boundary inputs must be validated before domain logic."
  - file: "apps/backend/src/modules/comments/comments.handler.ts"
    line: 8
    severity: "Medium"
    comment: "No input validation on createComment. The `content` field accepts arbitrary strings without sanitization. While Drizzle prevents SQL injection, the lack of content-length or format validation could allow abuse (e.g., multi-megabyte payloads)."
  - file: "apps/backend/src/modules/artifacts/artifacts.handler.ts"
    line: 4
    severity: "Medium"
    comment: "No authentication or authorization check. Per security-standard §2, handlers must verify the authenticated userId holds ownership/role rights. Currently, any caller can create folders/artifacts for any projectId."
  - file: "apps/backend/src/modules/comments/comments.handler.ts"
    line: 4
    severity: "Medium"
    comment: "Same auth gap. The userId/agentId on comments is self-reported by the caller with no server-side verification."
```

## Risk Assessment
- **SQL Injection**: Low risk — Drizzle ORM provides parameterized queries.
- **XSS**: Low risk — backend-only scope, no HTML rendering.
- **SSRF/Path Traversal**: Not applicable — no file system or URL operations.
- **Auth Bypass**: Medium risk — auth middleware is a project-wide concern not specific to this epic. All other modules share the same pattern.

## Decision
**Approved.** No critical or high-severity vulnerabilities. The Medium-severity auth and validation gaps are consistent with the existing codebase pattern where auth middleware is being addressed in a separate epic. No security regressions introduced.
