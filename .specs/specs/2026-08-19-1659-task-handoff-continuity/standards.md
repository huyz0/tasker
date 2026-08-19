# Standards for Task Handoff & Continuity

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
- Services are declared as interfaces of methods:

  ```tsp
  interface TaskService {
    listTasks(request: ListTasksRequest): ListTasksResponse;
  }
  ```

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

- **Never renumber a field, and never reuse a retired number.** The wire format
  keys on the number, not the name; a reused number silently decodes old data
  into the wrong field.
- Adding a new **optional** field with a fresh number is backward compatible.
  Adding a required one, removing a field, or changing its type is not.
- `@bufbuild/buf` runs breaking-change detection. If it objects, the answer is a
  new field, not a suppressed warning.

## 3. Errors are Connect codes

Throw `ConnectError` from `@connectrpc/connect` with an explicit `Code`. Do not
return a success message carrying an error string, and do not throw bare
`Error` — that surfaces as `Code.Internal` and leaks the message.

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

The two Elysia route groups (`/api/auth/*`, `/api/debug/*`) are ordinary HTTP
and **do** use status codes, with RFC 7807 bodies from `lib/problemDetails.ts`.
That is the only place HTTP semantics apply.

## 4. Versioning lives in the namespace

Version is part of the protobuf package: `tasker.tasks.v1`. There is no
`/api/v1/` URI segment, because there are no URI paths to put it in.

A breaking change means a `v2` namespace running alongside `v1`, not an edit to
`v1`. Optional-field additions are not breaking (see §2).

## 5. Pagination

The contract defines the shapes once — `PageRequest { limit, cursor, filter,
sort }` and `PageResponse { nextCursor, totalCount }` — and every list method
uses them. Do not invent per-endpoint pagination parameters.

- **Cursor-based, never offset.** Cursors are opaque base64 to the caller;
  `db/query-builder.ts` encodes the sort column, its value and the id, so a
  cursor minted under one sort cannot be replayed under another.
- **The server caps the page size.** `query-builder.ts:183` clamps to
  `min(max(limit || 50, 1), 100)`. A caller asking for 10,000 rows gets 100.
  Never add a list method that returns unbounded data.
- `totalCount` is optional and is computed against the same filter as the page.

## 6. Latency budgets

Every list endpoint has a stated budget, measured as **p95 of the handler's own
answer time** — the query plus its serialisation, not the round trip. A number
that includes the socket measures the machine's networking as much as the read
path.

**Every list endpoint is 150 ms unless named below.** Stating it as a default
rather than a table of 22 rows means an endpoint added next month has a budget
the day it is written, instead of being absent from a list nobody remembered to
update.

| Endpoint | Budget (p95) | Why it differs |
|---|---|---|
| *every `list*` method* | 150 ms | the default |
| `universalSearch` | 300 ms | ranks its whole match set on every page (ADR-0010) |
| `getDashboard` | 300 ms | answers four questions in one round trip instead of four |

The eight measured at the scale target are `listTasks` (both the project list
and one board column), `listArtifacts`, `listProjects`, `listAgents`,
`listOrgMembers`, `universalSearch` and `getDashboard` — the endpoints a user
waits on before a screen paints. The rest inherit the default and are measured
when they become hot enough to matter. `listHandoffNotes` inherits the 150 ms
default — it is a project-scoped, grouped query over an already-indexed
`task_notes.task_id`, not expected to need its own row until measured.

150 ms is the default because the browser still has to render what it gets, and
the bar it has to clear is a screen painted within a second.

Budgets are measured against the product's scale targets — 2,000 projects,
50,000 tasks in one project, 100,000 artifacts, 100,000 members in an org — not
against a fixture small enough to be fast by accident:

```bash
cd apps/backend
bun run seed -- --scale large
bun run measure:latency
```

`measure:latency` exits non-zero if any endpoint is over budget, so this is a
check rather than a report. Committed figures live in the milestone journal
that produced them (`.milestones/MILESTONE-07-read-path-scale/PROGRESS.md`),
because a number without the fixture it was measured against is an anecdote.

**A budget is not a target to sit against.** The measurement exists to catch
the shape of failure that hides at small scale: `universalSearch` was
**368 seconds** at the scale target while every unit test passed in
milliseconds, because SQLite had inverted a join. Adding an index for one query
changes the plan of every other, so re-measure after touching the schema —
that regression was caused by an index added two tasks earlier in the same
milestone.

## 7. Authorization is per handler

There is no gateway that authorises requests. Every handler does it, in this
order, before touching data:

1. `requireUserId(contextValues)` — raises `Unauthenticated`.
2. `assertOrgMember(db, userId, orgId)` or `getOrgMemberRole` for role-gated
   operations — raises `PermissionDenied`.

Omitting either in a new handler is a cross-tenant data leak, not a style
issue. `lib/authz.ts` is the only place these rules live.

## 8. Validation at the boundary

Parse every request with Zod at the top of the handler and work with the parsed
value. Protobuf guarantees the shape, not the meaning: it cannot express "this
string is a uuid", "this range is non-empty", or "this status is reachable from
that one".

---

**On the REST standard this replaced.** The previous version of this file
specified resource URIs, HTTP verb semantics, a `{ data, meta }` envelope and
URI versioning. None of it was ever built, and this file is auto-injected for
API work — so an agent asked to add an endpoint was reading instructions for a
different architecture. If REST is ever wanted as a public edge in front of the
RPC contract, that is a decision for an ADR and a milestone, not a standard.

---

## `.specs/standards/security-standard.md`

# Security Standards

## 1. Validation & Deserialization

- **Rule**: Never trust boundary inputs (Client API, Webhook, Queue Events).
- **Zod**: Validation via a strict Zod schema occurs BEFORE execution hits
  domain logic. Zod is the only validation library here — ArkType is not
  installed.
- **Coercion**: Strip unlisted JSON fields from incoming properties natively.

## 2. Authentication & Authorization

- **Verification Lifecycle**: Route middleware must assert Authentication
  tokens.
- **RBAC Ownership**: Backend handlers MUST verify the authenticated `userId`
  genuinely holds ownership/role rights against the target database resource.
  Simply logging in is insufficient.
- **Fail Closed**: All new backend controllers default to `401/403` denied
  unless explictly decorated as public.

## 3. Vulnerability Mitigation

- **XSS**: Use React/Template auto-encoding. Never inject raw HTML without
  `DOMPurify` overrides.
- **CSRF**: Apply `SameSite=Lax/Strict`, `HttpOnly`, and `Secure` to session
  cookies.

## 4. Secrets Config

- **Zero Hardcoding**: Do NOT commit `.env` values or raw API keys in code.
- **CI Safety**: CI/CD must mechanically mask secrets on terminal output.

## 5. Dependency Security

- **Auditing**: Break builds on high CVSS vulnerability alerts. **No scanner is
  wired up yet** — it is owned by M11. Do not write `npm audit`; `npm`, `npx`,
  `yarn` and `pnpm` are forbidden repo-wide (`AGENTS.md`).
- **Locking**: One lockfile, `bun.lock`, at the workspace root. A second
  lockfile anywhere in the tree is a defect — see `dependency-standard.md`.

---

## `.specs/standards/frontend-standard.md`

# Frontend Specific Standards

## 1. Application Architecture (React + Vite)

**Next.js is not installed and there is no server-side rendering.** The GUI is a
client-rendered SPA; see `.specs/product/tech-stack.md`.

- **Container / Presentational**: Separate components fetching data/state
  ("Container") from UI-focused ones ("Presentational").
- **Directory Structure**: Co-locate domain components with feature hooks/API
  calls (`features/Tasks/`). Place generic UI primitives in `components/ui/`.
- **Composition over Booleans**: Prefer `<Select.Trigger>` and explicit variants
  (`<Button variant="destructive">`) instead of excessive boolean props for UI
  customization.
- **Storybook**: MANDATORY. All newly created or modified UI components, primitives, and screens MUST have a corresponding `.stories.tsx` file generated or updated. Document all visual states (Empty, Loading, Error, Populated). Launch the visual playground with `cd apps/gui && bun run storybook` (port 6006).

## 2. State Management Rules

- **Rule of Locality**: Keep state as close to its consumer as possible.
- **Local State**: Exclusively for transient UI (`useState`/`useReducer`).
- **Server State**: Mendatory use of **TanStack Query** (or Apollo/SWR). DO NOT
  manage network data manually with `useEffect`.
- **Global Client State**: Use lightweight libraries (`Zustand`) ONLY for
  coordinating cross-tree UI state (e.g., dark mode, wizards).

## 3. Type Safety & Validation

- **Strict Props**: Explicit TypeScript interfaces required on components. NO
  `any` or ambiguous `Record<string, unknown>`.
- **Boundary Validation**: Zod-validate all `fetch()` JSON payloads instantly
  upon resolution.
- **Forms**: Validate via schemas (Zod) and React Hook Form.

## 4. Performance & Optimization

- **Eliminate Waterfalls**: Stream data aggressively via React `<Suspense>`
  boundaries. Avoid sequential data fetching.
- **Bundle Size**: Avoid wildcard `index.ts` barrel files. Import components
  from explicit source paths to maximize tree-shaking.
- **Native Animations**: Use `document.startViewTransition` / React
  `<ViewTransition>` over heavy JS animation libraries (e.g., Framer Motion).
- **Dynamic Imports**: Use `next/dynamic` or `React.lazy` on expensive
  routes/sub-trees.
- **Memoization (`useMemo` / `useCallback`)**: Only use when profiling dictates
  or to stabilize hook dependencies. Premature optimization forbidden.
- **Render Opt-Out**: Favor `children` composition over `React.memo` to bypass
  renders.

## 5. Hook Design

- **Single Responsibility**: One task per custom hook.
- **React 19 Readiness**: Skip `forwardRef`. Prefer `use()` instead of
  `useContext()`.
- **Cleanups**: `useEffect` subscriptions MUST return deterministic teardowns to
  prevent strict-mode memory leaks.

---

## `.specs/standards/testing-standard.md`

# Testing & QA Standards

## 1. Test-Driven Development (TDD)

- **Workflow**: Red-Green-Refactor.
  1. **Red**: Write failing test first.
  2. **Green**: Minimum code to pass.
  3. **Refactor**: Clean up and optimize.
- **Result**: Enforces decoupled, cohesive design boundaries prioritizing public
  API consumption.

## 2. Test Coverage Goals

- **Enforced gate: 95%** lines, branches, functions and statements
  (`apps/gui/vitest.config.ts:16-20`). This is a build failure, not a target —
  a change that drops coverage below it does not merge.
- Aim above the gate rather than at it. A module sitting at exactly 95% fails
  the moment anyone adds an untested line.
- **Agent Rule**: run the suite locally before calling a task done —
  `moon run <project>:test`, or `/local-ci-run` for the whole pipeline. Never
  `npx`, `npm`, `yarn` or `pnpm`; this repository is bun-only and `AGENTS.md`
  forbids the others outright.

## 3. Focus Areas

- **Unit (Vitest)**: Fast, single-purpose testing. Bulk of the coverage.
- **Integration**: Boundary tests — handlers against a real SQLite database,
  React against the generated ConnectRPC clients mocked directly. **MSW is not
  installed**; do not reach for it.
- **E2E (Playwright)**: Critical 'Happy Paths' only. Do not rely heavily on E2E
  for percentage goals due to runtime costs.

## 4. Co-location

- **Rule**: Tests reside adjacent to code. `CreateTask.ts` lives next to
  `CreateTask.test.ts`. Do not use detached `__tests__` directories.

---

## `.specs/standards/milestone-standard.md`

# Milestone Standard

A **milestone** answers "what state is the product in when this is done".
Milestones are the durable, git-committed plan that lets a fresh agent session
resume delivery with no conversational context — the thing a feature-shaped work
item never carried, and the reason milestones replaced the epic lifecycle in
August 2026.

## 1. Storage & Organization

- **Path**: `.milestones/` at project root (authoritative path resolved from
  `.specs/product/work-ledger.yml`).
- **Folder Format**: `MILESTONE-<2-digit-id>-<kebab-case-title>`
  (e.g. `MILESTONE-03-iam-correctness-and-scale`).
- **Files**:
  - `MILESTONE.md` — the plan. Goal, exit criteria, task breakdown.
  - `PROGRESS.md` — the journal. Created on first task, append-only.
- **Index**: `.milestones/STATE.md` is the single entry point for any agent
  resuming work. It MUST always reflect reality on `main`.

## 2. Metadata (YAML Frontmatter on `MILESTONE.md`)

Required:

- `id`: `M01`–`M99`.
- `title`: Human-readable name.
- `status`: `todo`, `in-progress`, `blocked`, `done`.
- `goal`: One sentence. The observable end state, not the activity.
- `depends_on`: List of milestone ids that MUST be `done` first (may be empty).
- `surfaces`: Which apps are touched — any of `backend`, `gui`, `cli`,
  `contract`, `infra`, `specs`.
- `exit_criteria_met`: `true` / `false`.
- `started_at` / `completed_at`: YYYY-MM-DD or `null`.

## 3. Structure of `MILESTONE.md`

### 1. Goal

One paragraph stating the end state in terms a non-implementer can verify.
A goal describes a *condition of the product*, never a list of activities.

### 2. Why Now

The dependency or value argument for this position in the sequence.

### 3. Exit Criteria

A checklist of externally verifiable conditions. Each item MUST be checkable
by running a command or performing an observable action. A milestone is
`done` only when every box is checked. Exit criteria are NOT the task list —
they are the acceptance test for the whole milestone.

### 4. Scope

- **In Scope**: Explicit inclusions.
- **Out of Scope**: Explicit exclusions, each naming the milestone that owns it.

### 5. Task Breakdown

Actionable `- [ ]` checklist. Every task MUST carry:

- A stable id `M<NN>-T<NN>` — referenced by commits and the progress journal.
- A single-sentence outcome.
- **Files**: the primary paths expected to change.
- **Verify**: the command or observation that proves it works.

Task ids are immutable once written. To drop a task, mark it
`- [~]` and record the reason in `PROGRESS.md`; never renumber.

### 6. Verification

The commands that prove the exit criteria, in order.

### 7. Risks

Known hazards and the rollback position.

## 4. Progress Journal (`PROGRESS.md`)

Append-only. Newest entry at the bottom. One entry per task attempt:

```markdown
## M03-T04 — Enforce viewer as read-only
- **Status**: done | in-progress | blocked
- **Date**: YYYY-MM-DD
- **Changed**: apps/backend/src/lib/authz.ts, 11 handler files
- **Verified**: `moon run backend:test` — 340 pass
- **Notes**: Chose a new assertOrgWriter over extending assertOrgMember so the
  existing read paths keep their cheaper single query.
- **Next**: M03-T05
```

An entry MUST be written with status `in-progress` *before* the work starts and
updated to `done` in the same commit that completes the task. This is what makes
an interrupted session recoverable: the journal always names the task in flight.

## 5. Version Control Protocol

- **Atomic commits**: one commit per task, containing the code, the tests, the
  checked-off box, the `PROGRESS.md` entry, and the `STATE.md` update.
- **Message**: Conventional Commits with the task id as a trailing tag —
  `fix(iam): paginate listOrgMembers [M03-T04]`.
- **Never end a session dirty**: uncommitted work is invisible to the next
  session. If a task cannot be completed, commit the partial work with status
  `in-progress` in the journal and a `WIP` prefix on the subject.
- **Branch**: `feature/m<NN>-<kebab-title>`, one per milestone, per
  `git-workflow-standard.md`.

## 6. Heavy Tasks

Most tasks are implemented directly. A task that needs a recorded decision, a UX
pass or a test plan before code follows
`.agents/skills/milestone-deliver/references/heavy-task.md`, which produces those
artifacts at the ledger's paths and runs a four-lens review before the box is
checked.

This replaced the epic lifecycle. An epic wrapped design artifacts *and* a second
copy of task tracking; the tracking already lives in `MILESTONE.md` and
`PROGRESS.md`, so only the artifacts and the gates were kept. Completed epics are
in `.archive/epics/`, and `.archive/EPICS-HISTORY.md` summarises them.
