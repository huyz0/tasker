# Tech Stack

Every entry under **In Use** is traceable to a committed manifest — `package.json`,
`apps/cli/go.mod`, or `.prototools`. `moon run :spec-drift` fails when a
dependency appears in a manifest without an entry here, or an entry here names
something no manifest declares.

**Planned** names technology a later milestone will introduce. It is not
installed. An agent must not import from it.

**Dropped** records ambitions that were written here, never built, and are owned
by nobody. They are listed so nobody reintroduces them by accident.

The drift check reads the backticked identifiers in the **In Use** tables. Two
rules keep it from crying wolf: `@types/*` packages are the type-only companion
of whatever they type and need no entry of their own, and a documented scope
written as `@scope/*` covers that scope's packages.

> Architecture, NFRs and decision records: [architecture.md](./architecture.md)
> and [`.specs/adr/`](../adr/).

---

## In Use

### Frontend — `package.json`, `apps/gui/package.json`

| Technology | Version | Role |
|---|---|---|
| `react`, `react-dom` | ^19.2.8 | UI runtime |
| `vite` + `@vitejs/plugin-react` | ^8.2.2 / ^6.1.0 | Build and dev server |
| `typescript` | ^6.0.3 | Language |
| `tailwindcss` + `@tailwindcss/vite` | ^4.3.3 | Styling, via semantic HSL tokens |
| `react-router-dom` | ^7.18.2 | Client-side routing |
| `@tanstack/react-query` | ^5.101.4 | Server state |
| `@tanstack/react-virtual` | ^3.14.10 | List virtualization |
| `zustand` | ^5.0.15 | Cross-tree UI state |
| `lucide-react` | ^1.33.0 | Icon set |
| `react-markdown`, `remark-gfm`, `rehype-sanitize` | ^10.1.0 / ^4.0.1 / ^6.0.0 | Markdown rendering |
| `@mdxeditor/editor` | ^4.2.0 | WYSIWYG markdown editing (`RichMarkdownEditor`, piloted on task description — ADR-0018) |
| `use-debounce` | ^10.1.1 | Input debouncing |
| `storybook`, `@storybook/*` (react, react-vite, addon-a11y, addon-docs, addon-vitest) | ^10.3.5 | Component documentation |
| `@chromatic-com/storybook` | ^5.3.0 | Storybook addon only — no Chromatic service is configured |
| `axe-core` | ^4.11.3 | Accessibility scanning, driven directly by `scripts/storybook-a11y.mjs` — a direct dependency rather than relying on `@storybook/addon-a11y`'s own transitive copy, which `require.resolve` from `apps/gui/package.json`'s own directory could not reliably find in a clean CI install |

The GUI is a **client-rendered single-page app**. There is no server-side
rendering; see Dropped.

### UI components

Primitives in `apps/gui/src/components/ui/`, mostly hand-rolled, with Radix
underneath the ones that need real focus/menu/tab semantics — see
[ADR-0011](../adr/ADR-0011-adopt-radix-for-overlay-and-navigation-primitives.md),
which reversed [ADR-0009](../adr/ADR-0009-component-primitives.md) on the
condition ADR-0009 itself named for reversal: user authorization, plus a second
overlay pattern (the search palette) that needed it.

Overlays go through one primitive, `components/ui/Dialog.tsx`, which owns the
seven behaviours ADR-0009 lists (`role="dialog"`, `aria-modal`, an accessible
name, focus in, focus trapped, `Escape` to close, focus restored) and has a test
for each — now backed by `@radix-ui/react-dialog` rather than a hand-rolled
focus trap. **Do not hand-roll a second overlay** — that is how the two
pre-M06 overlays ended up with no focus trap between them, and it is exactly
what Radix now exists in this repo to prevent.

| Technology | Version | Role |
|---|---|---|
| `@radix-ui/react-dialog` | ^1.1.23 | `Dialog.tsx` — the task detail overlay and the search palette |
| `@radix-ui/react-dropdown-menu` | ^2.1.24 | Row action menus (mobile-clipped actions), the sidebar overflow menu |
| `@radix-ui/react-tabs` | ^1.1.21 | Organizations' in-page sections, now routable tabs instead of local `useState` |

### Backend — `package.json`, `apps/backend/package.json`

| Technology | Version | Role |
|---|---|---|
| `bun` | 1.3.11 (`.prototools`) | Runtime and package manager |
| `elysia` | ^1.4.29 | Routing for `/api/auth/*` and `/api/debug/*` only — the listener is `node:http` |
| `@connectrpc/connect`, `@connectrpc/connect-node`, `@connectrpc/connect-web` | ^2.1.2 | Transport for the TypeSpec contract |
| `@bufbuild/protobuf` | ^2.14.0 | Generated message runtime |
| `drizzle-orm` / `drizzle-kit` | ^0.45.2 / ^0.31.10 | Schema, queries, migrations |
| `mysql2` | ^3.23.4 | MySQL driver |
| `bun:sqlite` | built into Bun | Standalone/local driver |
| `nats` | ^2.29.3 | Durable relay, audit consumption and ephemeral live feed |
| `zod` | ^4.4.3 | Runtime validation at boundaries |
| `pino` | ^10.3.1 | Structured JSON logging |
| `nodemailer` | ^9.0.5 | SMTP for the invitation email; no transport is constructed unless `SMTP_HOST` is set |
| `@opentelemetry/api`, `@opentelemetry/core` | ^1.9.1 / ^2.10.0 | Trace context and the propagator (M11) |
| `@opentelemetry/sdk-trace-node` | ^2.10.0 | Span creation and batching |
| `@opentelemetry/exporter-trace-otlp-http` | ^0.221.0 | OTLP export, created only when an endpoint is configured |
| `@opentelemetry/resources`, `@opentelemetry/semantic-conventions` | ^2.10.0 / ^1.43.0 | Service identity and standard attribute names |

**Authentication**: local username/password accounts and optional linked Google
identity, implemented in `apps/backend/src/modules/auth/` and
`apps/backend/src/lib/credentials.ts`. Agent tokens are separate scoped,
revocable principals; they are not human session credentials.

**Events**: production mutations capture SQL source events and deterministic
webhook rows transactionally. An ACKed, fenced relay publishes bounded NATS
references; a separate consumer projects the committed source into `audit_log`.
Standalone without a broker projects locally. The bounded/resync-capable live
`EventService.SubscribeEvents` feed is separate from durable audit delivery.
See `lib/domainEventOutbox.ts`, `lib/domainEventRelay.ts`,
`consumers/auditProjector.ts` and `modules/events/events.handler.ts`.

**Tracing** (M11, superseding ADR-0004's "not yet"): the SDK is always present,
but an exporter is created **only** when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
Without one, spans still exist, `traceparent` still propagates and every log
line still carries a trace id — all in process, and nothing ever opens a
connection to a collector that is not there, which is what keeps the M09
standalone promise intact.

### Database & search

- **MySQL** for the clustered deployment, **`bun:sqlite`** for standalone, behind
  one schema per dialect (`src/db/schema.mysql.ts`, `src/db/schema.sqlite.ts`).
- **Search uses SQLite FTS5 and MySQL FULLTEXT**, implemented in
  `apps/backend/src/modules/search/search.handler.ts` with maintained indexes.
  M07 superseded the original LIKE-scanning decision.
- **OpenSearch and a separate read store are not installed.** A saturated
  one-project write burst does not select a replacement read architecture.

| Technology | Version | Role |
|---|---|---|
| `better-sqlite3` | ^12.11.1 | Not imported by this repo — `drizzle-kit` loads it dynamically for `sqlite` migrations. See the correction below. |

### CLI — `apps/cli/go.mod`

| Technology | Version | Role |
|---|---|---|
| `go` | 1.26.11 (`.prototools`, `go.mod`) | Language |
| `connectrpc.com/connect` | v1.19.1 | RPC client |
| `github.com/spf13/cobra` | v1.10.2 | Command parsing |
| `github.com/spf13/pflag` | v1.0.10 | Direct, not transitive: the flag-reset test helper uses `SliceValue.Replace` to stop slice flags accumulating across shuffled runs |
| `google.golang.org/protobuf` | v1.36.11 | Generated message runtime |
| `golang.org/x/term` | v0.45.0 | Masked password prompt for `auth login --username` (M13-T13) — reading a raw terminal without echo cross-platform isn't a stdlib one-liner, so this is the one dependency-standard.md's minimalism rule doesn't reject. |

Output is human-readable text or compact `--json`; supported paged commands
provide `--page-all` NDJSON. `tasker mcp` relays stdio to the existing backend
MCP endpoint. The default `--timeout` is 30 seconds per backend request, not
an entire command/session. There is no TUI, field-mask or schema-inspection
command; Viper, Charmbracelet and `mcp-go` remain absent.

### API contract — `package.json`

| Technology | Version | Role |
|---|---|---|
| `@typespec/compiler` | ^1.15.0 | Contract language |
| `@typespec/protobuf` | ^0.81.0 | TypeSpec → protobuf emitter |
| `@bufbuild/protoc-gen-es` | ^2.14.0 | protobuf → TypeScript |
| `@bufbuild/buf` | ^1.72.0 | Proto linting and breaking-change detection |

`packages/shared-contract` holds the generated output.

### Build & toolchain — `.prototools`

| Technology | Version | Role |
|---|---|---|
| `moon` | 2.4.6 | Task running, caching, CI orchestration |
| `node` | 24.22.3 | Runs the zero-dependency gate scripts |
| `bun` | 1.3.11 | Backend runtime, package manager, test runner |
| `go` | 1.26.11 | CLI toolchain |

proto owns all four pins. Every moon project is `language: system`; commands
resolve through proto's shims, so these versions are what actually run.

### Quality — `package.json`, `apps/gui/package.json`

| Technology | Version | Role |
|---|---|---|
| `oxlint` | ^1.79.0 | Linting — replaces ESLint and Prettier |
| `knip` | ^6.32.2 | Unused files, dependencies and exports |
| `vitest`, `@vitest/coverage-v8`, `@vitest/browser-playwright` | ^4.1.11 | Unit and integration tests, 95% thresholds |
| `msw` | ^2.15.0 | Network-level interception in GUI RPC tests (M12-T01) — intercepts the real `fetch` the real Connect transport makes, so a test exercises real request/response serialization instead of a hand-mocked client |
| `playwright`, `@playwright/test` | ^1.62.1 | End-to-end and screenshot capture |
| `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom` | ^16.3.2 / ^10.4.1 / ^6.10.0 | Component queries |
| `jest-axe` | ^11.0.0 | Accessibility assertions per page |
| `jsdom` | ^29.1.1 | Test DOM |
| `markdownlint-cli2`, `@a24z/mermaid-parser`, `glob` | ^0.23.2 / ^1.0.0 / ^13.0.6 | Markdown and Mermaid gate |

Git hooks are plain shell in `.githooks/`, wired by `moon run :setup-hooks`.
Husky and lint-staged are not installed.

### Correction — the two "unused" devDependencies are load-bearing

An earlier revision of this file (M02-T01) listed `better-sqlite3` and
`@storybook/addon-onboarding` as declared-and-unused, on the strength of having
no `import` anywhere in `src/`. Both conclusions were wrong, and the drift check
built in M02-T04 is what forced the second look:

- **`better-sqlite3`** is loaded by `drizzle-kit`, which does
  `import("better-sqlite3")` at runtime for the `sqlite` dialect. Nothing
  declares it as a peer, so it has to be declared here or
  `drizzle-kit push --config drizzle.sqlite.config.ts` fails. It now has a row
  in the table above. **Do not remove it because grep finds no import** — that
  is exactly the reasoning that got it labelled unused.
- **`@storybook/addon-onboarding`** is registered in
  `apps/gui/.storybook/main.ts:13`, so it is an active addon, not leftover
  scaffolding. It is covered by the `@storybook/*` entry.

---

## Future decisions

No uninstalled technology is approved here merely because an old milestone
once named it. FTS indexes, event consumers, OpenTelemetry, GoReleaser and
vulnerability CI are delivered. The in-process transport was rejected in
ADR-0019. A visual state-machine canvas, separate read store and shared
rate coordination need a new recorded decision before adding dependencies.

Actual staged limits are in [performance evidence](../../docs/performance.md).
The 1000-caller workload saturates severely; neither that run nor historical
data-volume measurements establish 20000 concurrent clients.

---

## Dropped

Written here before this milestone, never built, owned by no milestone. Do not
reintroduce without a roadmap entry and an owner.

| Technology | Why it is gone |
|---|---|
| Server-side rendering | The GUI is a client-rendered SPA. No milestone plans SSR, and the single-binary target (M09) serves static assets. |
| React Flow | A visual state-machine canvas is not built; M05 delivered the existing list/detail editor. No library is selected for a future canvas. |
| Typedoc | No generated API documentation is published or planned. |
| Stylelint | Tailwind class usage is covered by `gui:design-lint`. |
| ArkType | Zod is the single validation library. |
| Charmbracelet TUI, Viper, `mcp-go` | No TUI or these libraries are installed. The delivered stdio MCP relay is existing Go/HTTP code, not `mcp-go`. |
| Chromatic service, Checkly | No visual-regression or uptime service is configured or budgeted. |
| `npx skills` distribution | Skills are read from `.agents/` by the host agent; nothing is packaged or published. `npx` is forbidden repo-wide. |

## Security patch constraints (M52)

The root lockfile refresh stays within existing dependency ranges. Root overrides select `markdown-it` 15.0.3 (through markdownlint-cli2), `undici` 7.30.1 (through jsdom), Vite 8.3.6 and Zod 4.6.7 so their already-installed transitive copies cannot remain on releases with the November 2026 high-severity advisories. These are dependency patch constraints, not additional product libraries. Storybook is refreshed within its existing range; Vite and Zod constraints deduplicate old nested copies within their existing ranges; the audit gate and its empty exception list remain enabled.

Go's module minimum and proto pin are 1.26.11. The earlier publication scan found ten reachable standard-library vulnerabilities on 1.26.6, requiring crypto/x509's 1.26.10 fix (GO-2026-6809). The 21 November post-main audit additionally reports net/http GO-2026-6859 in 1.26.10; 1.26.11 fixes that advisory. No Go production dependency is added.

CI and release packaging read exact Node/Bun/Moon versions from `.prototools`
through local setup actions. Node 24.22.3 is the official 2026-11-11 security
release (<https://github.com/nodejs/node/releases/tag/v24.22.3>). The Node action
compares the selected executable version; Go reads its exact module minimum.
