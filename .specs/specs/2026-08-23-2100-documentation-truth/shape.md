# Documentation Truth — Shaping Notes

## Scope

Correct the three documents `AGENTS.md` designates as ground truth, then gate
them. Specs and tooling only — no product behaviour changes.

## Why this is a defect, not housekeeping

`AGENTS.md` §"Just-In-Time Context" instructs every agent session to read
`README.md` first and treat `.specs/` as authoritative. A session that reads
"Teams does not exist at all" or "agent identity is not separate from human
identity yet" will plan around a product that has not existed for months.
M02's entire purpose was to make `.specs/` traceable to running code; this is
that guarantee having lapsed without anything noticing.

The correlation that decides the design: of the five product/design
documents, `tech-stack.md` is the only clean one, and the only one with a
gate.

## The false statements, and how each was verified

Each was checked against the code, not inferred from the ledger.

**`README.md`**

| Claim | Reality |
|---|---|
| "Today the GUI is not real-time… no polling, no WebSocket and no server-sent events… nothing consumes them; live updates are **M08**" | `modules/events/events.handler.ts`'s server-streaming `subscribeEvents`, `gui/src/hooks/useLiveEvents.ts`, `LiveStatusIndicator`. Shipped M08. |
| "Teams have **no table in the schema yet** — they are **M10**" | `db/schema.sqlite.ts`'s `teams` and `team_members`, `modules/teams/`, `cmd/teams.go`, `features/Teams/`. Shipped M10. |
| "`build:standalone`… bundles the backend only — a `GET /` returns a placeholder page… A genuinely portable single binary is **M09**" | `scripts/bundle-gui.ts`, `db/embeddedMigrations.ts`, `lib/staticServer.ts`. Shipped M09 — and contradicted by this same README's own "run `./tasker --open --seed`" instructions. |
| "Read-path scale is **M07**; the numbers become claims when something measures them, which is **M12**" | Both closed. `scripts/measure-latency.ts` exists and its p95s are committed. |
| "what the **eight** scopes grant" | Ten: the original eight plus `memory:read`/`memory:write` (M21), and `events:read` (M26). |
| "**None has been measured** — there is no load test or benchmark in the repository" | Half true, and the half that is false flatters: latency *is* measured at the data-scale targets and within budget. Concurrency genuinely never has been. Corrected to say precisely that rather than deleted. |

**`.specs/product/architecture.md`** — this file's own rule (line 5) is that
everything under **Built** is present-tense-true and citable. Six statements
violate it, and three are contradicted by a later section of the same file:

- "Agent identity is not separate from human identity yet… no M2M token
  issuance. That is **M04**" — `lib/agentToken.ts`, `lib/scopes.ts`,
  `authz.ts`'s agent branch, `cmd/auth_token.go`.
- "Search is `LIKE`-based… An FTS5 virtual table… **Nothing writes to it**" —
  `modules/search/search.handler.ts` uses contentless FTS5 with `bm25()`
  ranking, MySQL `FULLTEXT` on the other dialect.
- "**There is no subscriber anywhere in the repository**" — `consumers/`
  runs the audit projector; this same file documents it at line 194.
- "**All RPCs are unary**" — `EventService/SubscribeEvents` is a server
  stream.
- "Telemetry is in-process counters… **No `@opentelemetry` package is
  installed**" — `lib/telemetry/otel.ts`; contradicted at line 180 of the
  same file.
- "**No rate limiting or per-key quota exists**" — `lib/rateLimit.ts`,
  `lib/loginRateLimiter.ts`.
- Counts: "fourteen services", "twelve modules" — there are 21 and 19.
- The whole **Planned Architecture** section: seven subsections, every one
  naming a milestone that is now closed.

**`.specs/design/NAVIGATION.md`**

- "Teams does not exist at all — teams are **M10**" — false.
- "`/settings` renders `GenericPlaceholder`… **nothing links to it**" — it
  routes to `SystemHealthPage` and sits in the sidebar's Configuration group.
- "there is **no breadcrumb component in the repository**" —
  `components/layout/Breadcrumbs.tsx`, which has a story.
- The route table omits `/register`, `/task-types`, `/roles`, `/teams`,
  `/memory`, `/memory/:beliefId`, `/handoffs`.

## Decisions

- **Correct, don't delete.** Every one of these sentences was written to be
  useful — they told a reader what was missing. The replacement says what is
  there, with the same specificity, rather than going quiet.
- **The gate detects milestone ownership, not prose truth** — see ADR-0024
  for the four options weighed. It catches "this document says a closed
  milestone owns unbuilt work", which described nearly all the drift, and
  deliberately does not pretend to settle whether an unattributed sentence is
  true.
- **Historical attribution must keep working.** `(M09-T02/T03)`, `M08's
  streaming endpoint`, `whose "until M11" this discharges` are legitimate and
  frequent. A checker that flagged them would be disabled within a week, so
  the rules distinguish pending ownership from citation and the suite pins
  both directions.
- **Prove the gate against history, not a fixture.** T05 runs it over the
  pre-M27 text of all three documents recovered from git, and it must name
  the real stale claims. A gate demonstrated only on synthetic input is
  fitted to its own tests.
- **Fix the documents before adding the gate**, so no commit in this
  milestone leaves `moon check --all` red. The historical demonstration is
  what supplies the red-phase evidence that the gate works.

## Deliberately not built

- A "every route in `App.tsx` appears in NAVIGATION.md" check — worth having,
  but it is a GUI-shaped gate and belongs with a GUI round.
- Actually measuring the concurrency targets. The README's wording about them
  is corrected here; simulating 20,000 concurrent agents is a milestone of
  its own and is named in STATE.md as such.
- `mission.md` corrections — it is pure intent and contains no false claim.
  It joins the gate's checked set anyway.

## Context

- **Visuals:** none.
- **Milestone:** `.milestones/MILESTONE-27-documentation-truth/`
- **ADR:** ADR-0024 (detecting documentation staleness)
