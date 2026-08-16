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
| `react`, `react-dom` | ^19.2.5 | UI runtime |
| `vite` + `@vitejs/plugin-react` | ^8.0.8 / ^6.0.1 | Build and dev server |
| `typescript` | ^6.0.2 | Language |
| `tailwindcss` + `@tailwindcss/vite` | ^4.2.2 | Styling, via semantic HSL tokens |
| `react-router-dom` | ^7.14.0 | Client-side routing |
| `@tanstack/react-query` | ^5.97.0 | Server state |
| `@tanstack/react-virtual` | ^3.14.6 | List virtualization |
| `zustand` | ^5.0.12 | Cross-tree UI state |
| `lucide-react` | ^1.8.0 | Icon set |
| `react-markdown`, `remark-gfm`, `rehype-sanitize` | ^10.1.0 / ^4.0.1 / ^6.0.0 | Markdown rendering |
| `use-debounce` | ^10.1.1 | Input debouncing |
| `storybook`, `@storybook/*` (react, react-vite, addon-a11y, addon-docs, addon-vitest) | ^10.3.5 | Component documentation |
| `@chromatic-com/storybook` | ^5.1.1 | Storybook addon only — no Chromatic service is configured |

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
| `elysia` | ^1.4.28 | Routing for `/api/auth/*` and `/api/debug/*` only — the listener is `node:http` |
| `@connectrpc/connect`, `@connectrpc/connect-node`, `@connectrpc/connect-web` | ^2.1.1 | Transport for the TypeSpec contract |
| `@bufbuild/protobuf` | ^2.11.0 | Generated message runtime |
| `drizzle-orm` / `drizzle-kit` | ^0.45.2 / ^0.31.10 | Schema, queries, migrations |
| `mysql2` | ^3.22.0 | MySQL driver |
| `bun:sqlite` | built into Bun | Standalone/local driver |
| `nats` | ^2.29.3 | Domain event publishing |
| `zod` | ^4.3.6 | Runtime validation at boundaries |
| `pino` | ^10.3.1 | Structured JSON logging |

**Authentication**: OAuth 2.1 with Google, implemented in
`apps/backend/src/modules/auth/`.

**Events**: the backend *publishes* to NATS. Nothing consumes yet — the audit
trail and live GUI are M08.

### Database & search

- **MySQL** for the clustered deployment, **`bun:sqlite`** for standalone, behind
  one schema per dialect (`src/db/schema.mysql.ts`, `src/db/schema.sqlite.ts`).
- **Search is `LIKE`-based** — `src/modules/search/search.handler.ts:35`. An FTS5
  virtual table `search_index` is created in `src/db/db.ts` and read only by the
  health probe; **nothing writes to it**. A real index is M07.
- **OpenSearch is not installed** — see Planned.

| Technology | Version | Role |
|---|---|---|
| `better-sqlite3` | ^12.8.0 | Not imported by this repo — `drizzle-kit` loads it dynamically for `sqlite` migrations. See the correction below. |

### CLI — `apps/cli/go.mod`

| Technology | Version | Role |
|---|---|---|
| `go` | 1.26.1 (`.prototools`, `go.mod`) | Language |
| `connectrpc.com/connect` | v1.19.1 | RPC client |
| `github.com/spf13/cobra` | v1.10.2 | Command parsing |
| `google.golang.org/protobuf` | v1.36.11 | Generated message runtime |

Output is human-readable text or `--json`. **There is no TUI and no MCP server
mode**; Viper, the Charmbracelet ecosystem and `mcp-go` are not dependencies.

### API contract — `package.json`

| Technology | Version | Role |
|---|---|---|
| `@typespec/compiler` | ^1.11.0 | Contract language |
| `@typespec/protobuf` | ^0.81.0 | TypeSpec → protobuf emitter |
| `@bufbuild/protoc-gen-es` | ^2.11.0 | protobuf → TypeScript |
| `@bufbuild/buf` | ^1.67.0 | Proto linting and breaking-change detection |

`packages/shared-contract` holds the generated output.

### Build & toolchain — `.prototools`

| Technology | Version | Role |
|---|---|---|
| `moon` | 2.4.6 | Task running, caching, CI orchestration |
| `node` | 24.12.0 | Runs the zero-dependency gate scripts |
| `bun` | 1.3.11 | Backend runtime, package manager, test runner |
| `go` | 1.26.1 | CLI toolchain |

proto owns all four pins. Every moon project is `language: system`; commands
resolve through proto's shims, so these versions are what actually run.

### Quality — `package.json`, `apps/gui/package.json`

| Technology | Version | Role |
|---|---|---|
| `oxlint` | ^1.61.0 | Linting — replaces ESLint and Prettier |
| `knip` | ^6.32.2 | Unused files, dependencies and exports |
| `vitest`, `@vitest/coverage-v8`, `@vitest/browser-playwright` | ^4.1.4 | Unit and integration tests, 95% thresholds |
| `playwright`, `@playwright/test` | ^1.59.1 | End-to-end and screenshot capture |
| `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom` | ^16.3.2 / ^10.4.1 / ^6.9.1 | Component queries |
| `jest-axe` | ^11.0.0 | Accessibility assertions per page |
| `jsdom` | ^29.0.2 | Test DOM |
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

## Planned

Not installed. Each is owned by the milestone that will introduce it.

| Technology | Purpose | Owner |
|---|---|---|
| A real search index (OpenSearch or SQLite FTS5 populated for real) | Replace `LIKE` scanning | **M07** |
| Event consumers over NATS | Audit trail and live-updating GUI | **M08** |
| In-process transport | Bypass the network stack inside the single binary | **M09** |
| Graphical state-machine editing | Configure task state machines from the GUI; library not yet chosen | **M05** |
| OpenTelemetry | Distributed tracing and metrics, OTLP export | **M11** |
| GoReleaser | Multi-platform CLI release | **M12** |
| Dependency vulnerability scanning | Supply-chain gate | **M11** |

---

## Dropped

Written here before this milestone, never built, owned by no milestone. Do not
reintroduce without a roadmap entry and an owner.

| Technology | Why it is gone |
|---|---|
| Server-side rendering | The GUI is a client-rendered SPA. No milestone plans SSR, and the single-binary target (M09) serves static assets. |
| React Flow | Named as the state-machine editor before that surface was designed. M05 owns the capability; the library is an open choice. |
| Typedoc | No generated API documentation is published or planned. |
| Stylelint | Tailwind class usage is covered by `gui:design-lint`. |
| MSW | Tests mock the generated ConnectRPC clients directly. |
| ArkType | Zod is the single validation library. |
| Charmbracelet TUI, Viper, `mcp-go` | The CLI is flag-and-JSON driven. No milestone owns a TUI or an MCP server mode. |
| Chromatic service, Checkly | No visual-regression or uptime service is configured or budgeted. |
| `npx skills` distribution | Skills are read from `.agents/` by the host agent; nothing is packaged or published. `npx` is forbidden repo-wide. |
