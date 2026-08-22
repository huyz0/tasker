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
| `getReportExceptions` | 300 ms | five exception panels plus the fleet scorecard in one round trip (M24) |
| `getReportTrends` | 300 ms | the CFD aggregates the project's entire activity history, not just the window (M24) |

The ten measured at the scale target are `listTasks` (both the project list
and one board column), `listArtifacts`, `listProjects`, `listAgents`,
`listOrgMembers`, `universalSearch`, `getDashboard` and both Report RPCs — the
endpoints a user waits on before a screen paints. The rest inherit the default
and are measured when they become hot enough to matter.

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
