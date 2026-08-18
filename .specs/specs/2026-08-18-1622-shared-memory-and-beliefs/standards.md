# Standards for Shared Memory & Belief System

---

## `.specs/standards/api-standard.md`

# API Architecture Standards

**This system does not serve a REST API.** It serves a contract-first RPC API:
TypeSpec → protobuf → Connect-RPC, with generated clients in TypeScript and Go.
Everything below describes that. An earlier revision of this file described
REST resources, `/api/v1/` URI versioning and a `{ data, meta }` envelope, none
of which exists — see the note at the end before reintroducing any of it.

## 1. Contract first, always

The contract is `packages/shared-contract/main.tsp`. It is the source; the
TypeScript and Go clients and the server stubs are generated from it.

- **Never hand-write a type that crosses the wire.** Add it to the TypeSpec
  contract and regenerate. A type declared in a handler is a type the CLI and
  GUI cannot see.
- One `namespace Tasker.<Domain>.V1` per bounded context, with a matching
  `@package({ name: "tasker.<domain>.v1" })`.
- Services are declared as interfaces of methods.
- **Methods, not resources.** `listTasks`, `archiveAgent`, `purgeArtifact`. The
  REST instinct to force every operation into five HTTP verbs against a noun
  does not apply and produces worse names here.
- **Every method takes exactly one request message and returns exactly one
  response message**, both named after it. This is what keeps a new optional
  field from being a signature change.
- All RPCs are **unary**. No streaming method exists in the contract; adding the
  first one is an architectural decision, not a routine change.

## 2. Field numbers are permanent

Every field carries an explicit `@field(n)`. These are protobuf wire numbers.

- **Never renumber a field, and never reuse a retired number.**
- Adding a new **optional** field with a fresh number is backward compatible.
  Adding a required one, removing a field, or changing its type is not.
- `@bufbuild/buf` runs breaking-change detection. If it objects, the answer is a
  new field, not a suppressed warning.

## 3. Errors are Connect codes

Throw `ConnectError` from `@connectrpc/connect` with an explicit `Code`.

| Code | Use for |
|---|---|
| `Code.InvalidArgument` | Zod validation failure, malformed id, bad enum |
| `Code.NotFound` | The row does not exist, or the caller may not know it does |
| `Code.PermissionDenied` | Authenticated, but not a member of the org or lacking the role |
| `Code.Unauthenticated` | No session — `requireUserId` raises this |
| `Code.AlreadyExists` | Uniqueness conflict |
| `Code.FailedPrecondition` | The state machine forbids this transition right now |

Prefer `NotFound` over `PermissionDenied` when revealing existence is itself a
leak across org boundaries.

## 4. Versioning lives in the namespace

Version is part of the protobuf package: `tasker.tasks.v1`. A breaking change
means a `v2` namespace running alongside `v1`, not an edit to `v1`.

## 5. Pagination

`PageRequest { limit, cursor, filter, sort }` / `PageResponse { nextCursor,
totalCount }`, every list method. Cursor-based, never offset. Server caps
page size at `min(max(limit || 50, 1), 100)`.

## 6. Latency budgets

Every list endpoint is 150ms p95 by default. `universalSearch`/`getDashboard`
are 300ms. Measured with `bun run measure:latency` against `--scale large`.

## 7. Authorization is per handler

No gateway authorizes requests. Every handler: `requireUserId` →
`assertOrgMember`/role check, in that order, before touching data.

## 8. Validation at the boundary

Parse every request with Zod at the top of the handler.

---

## `.specs/standards/security-standard.md`

# Security Standards

## 1. Validation & Deserialization

- Never trust boundary inputs. Zod is the only validation library; validate
  before domain logic. Strip unlisted JSON fields.

## 2. Authentication & Authorization

- Route middleware asserts authentication tokens.
- **RBAC Ownership**: Backend handlers MUST verify the authenticated `userId`
  genuinely holds ownership/role rights against the target database resource.
  Simply logging in is insufficient.
- **Fail Closed**: new backend controllers default to denied unless explicitly
  decorated as public.

## 3. Vulnerability Mitigation

- XSS via React auto-encoding, never raw HTML without `DOMPurify`.
- CSRF via `SameSite`/`HttpOnly`/`Secure` cookies.

## 4. Secrets Config

- Zero hardcoding of `.env` values or API keys. CI masks secrets in output.

## 5. Dependency Security

- No scanner wired up yet (M11). One lockfile, `bun.lock`, at the workspace
  root.

---

## `.specs/standards/dependency-standard.md`

# Dependency Standards

## 1. Versioning

- Latest stable versions. No pre-releases unless architecturally justified.
  Applications pin exact versions; libraries use ranges.

## 2. Selection

- **Minimalism**: prefer stdlib or local utils; reject dependencies for
  trivial tasks. Verify active maintenance. Prefer flat dependency trees.

## 3. Management

- `bun.lock` is the only permitted JS/TS lockfile; `go.sum` for Go. Single
  package manager per ecosystem, no mixing. Prune unused dependencies.

## 4. Ecosystems

- Synchronize identical package versions across workspaces (Node/Bun). No
  `replace` directives in Go production code.

---

## `.specs/standards/frontend-standard.md`

# Frontend Specific Standards

## 1. Application Architecture (React + Vite)

Client-rendered SPA, no SSR.

- **Container / Presentational**: separate data/state components from
  UI-focused ones.
- **Directory Structure**: co-locate domain components with feature hooks/API
  calls (`features/<Domain>/`); generic primitives in `components/ui/`.
- **Composition over Booleans**: prefer explicit variants over boolean props.
- **Storybook**: MANDATORY for all new/modified components, primitives,
  screens. Document Empty/Loading/Error/Populated states.

## 2. State Management Rules

- Local state for transient UI only. **TanStack Query** mandatory for server
  state — no manual `useEffect` fetching. **Zustand** only for cross-tree UI
  state.

## 3. Type Safety & Validation

- Explicit TypeScript interfaces, no `any`. Zod-validate boundary payloads.
  Forms via Zod + React Hook Form.

## 4. Performance & Optimization

- Avoid sequential fetch waterfalls. No barrel `index.ts` files.
  `document.startViewTransition`/`React.lazy` over animation libraries.
  Memoize only when profiling dictates.

## 5. Hook Design

- One responsibility per hook. Skip `forwardRef`, prefer `use()`.
  Deterministic `useEffect` teardowns.

---

## `.specs/standards/testing-standard.md`

# Testing & QA Standards

## 1. Test-Driven Development (TDD)

- Red-Green-Refactor.

## 2. Test Coverage Goals

- **Enforced gate: 95%** lines/branches/functions/statements — build
  failure, not a target. Run the suite locally before calling a task done.

## 3. Focus Areas

- Unit (Vitest) — bulk of coverage. Integration — handlers against real
  SQLite, React against mocked generated Connect clients (MSW forbidden).
  E2E (Playwright) — happy paths only.

## 4. Co-location

- Tests reside adjacent to code, no `__tests__` directories.

---

## `.specs/standards/milestone-standard.md`

# Milestone Standard

A milestone answers "what state is the product in when this is done" —
the durable, git-committed plan that lets a fresh agent session resume
delivery with no conversational context.

## 1. Storage & Organization

- Path: `.milestones/` at project root.
- Folder: `MILESTONE-<2-digit-id>-<kebab-case-title>`.
- Files: `MILESTONE.md` (the plan), `PROGRESS.md` (the journal, created on
  first task, append-only).
- `.milestones/STATE.md` is the single entry point for any agent resuming
  work; it MUST always reflect reality on `main`.

## 2. Metadata (YAML frontmatter on `MILESTONE.md`)

`id`, `title`, `status` (`todo`/`in-progress`/`blocked`/`done`), `goal` (one
sentence, observable end state), `depends_on`, `surfaces`, `exit_criteria_met`,
`started_at`/`completed_at`.

## 3. Structure of `MILESTONE.md`

1. Goal — one paragraph, a condition of the product, never a list of
   activities.
2. Why Now.
3. Exit Criteria — externally verifiable checklist; NOT the task list.
4. Scope — In/Out, each Out item naming its owning milestone.
5. Task Breakdown — `- [ ] **M<NN>-T<NN>**` items, each with Files/Verify.
   Task ids are immutable; a dropped task becomes `- [~]`, never renumbered.
6. Verification — the commands that prove the exit criteria.
7. Risks.

## 4. Progress Journal (`PROGRESS.md`)

Append-only, newest at the bottom, one entry per task attempt: Status, Date,
Changed, Verified, Notes, Next. Written `in-progress` before work starts,
flipped to `done` in the same commit that finishes it.

## 5. Version Control Protocol

- One commit per task: code, tests, checked-off box, `PROGRESS.md` entry,
  `STATE.md` update. Conventional Commits with the task id as a trailing tag.
- Never end a session dirty. Branch: `feature/m<NN>-<kebab-title>`.
