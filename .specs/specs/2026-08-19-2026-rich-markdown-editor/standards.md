# Standards for Rich Markdown Editor

---

## `.specs/standards/dependency-standard.md`

# Dependency Standards

## 1. Versioning

- **Latest Stable**: MUST use latest stable versions.
- **No Pre-releases**: FORBIDDEN (alpha/beta/rc) unless architecturally justified.
- **Pinning**: Applications MUST pin exact versions. Libraries use ranges (`^`, `~`).

## 2. Selection

- **Minimalism**: Prefer stdlib or local-utils. Reject dependencies for trivial tasks.
- **Health**: MUST verify active maintenance. FORBIDDEN: abandoned or deprecated packages.
- **Security**: Prefer packages with flat dependency trees (minimal transitives).

## 3. Management

- **Lockfiles**: MUST commit exactly one lockfile per ecosystem, at the
  repository root for JS/TS:
  - **JS/TS**: `bun.lock` is the ONLY permitted lockfile. `package-lock.json`,
    `yarn.lock`, `pnpm-lock.yaml` and `bun.lockb` are FORBIDDEN and MUST NOT
    exist anywhere outside `node_modules/` — including inside a workspace
    package. A second lockfile records a second, unverified resolution of the
    same dependency graph, and nothing in the build ever reads it.
  - **Go**: `go.sum`, alongside `go.mod`.
- **Toolchain**: Enforce single package manager per ecosystem (Bun for TS/JS, Go modules). NO mixing.
- **Pruning**: MUST remove unused dependencies (`knip`, `go mod tidy`).

## 4. Ecosystems

- **Node/Bun**: Synchronize versions of identical packages across workspaces.
- **Go**: FORBIDDEN: `replace` directives in production code.

---

## `.specs/standards/ui-ux-standard.md`

# UI/UX Standards

> Rules here are enforced by `moon run gui:design-lint` (tokens, contrast, and
> the statically checkable Web Interface Guidelines) and by the axe assertion on
> every page. Judgement that no regex can make — hierarchy, density, whether the
> screen has a point of view — is covered by `/design-review`, which looks at
> rendered screenshots rather than at source.

## 1. Design Tokens & System

- **Rule**: NEVER hardcode color hexes or ad-hoc pixel values
  (`style={{ color: '#000' }}`).
- **Action**: Strictly use Tailwind CSS classes mapped to tokens
  (`text-primary`, `bg-background`). Prefer cohesive, bold palettes over timid
  AI defaults.
- **Reference**: MUST strictly follow the explicit token mappings defined in `.specs/design/design-system.md`.
- **Components**: Primitives are **hand-rolled in this repository** — Shadcn and
  Radix are not installed, and the reasoning plus M06's revisit is in
  [ADR-0005](../adr/ADR-0005-hand-rolled-ui-primitives-instead-of-shadcn-and-radix.md).
  Reach for an existing primitive in `apps/gui/src/components/ui/` before
  writing a new one; put generic components there and standard layouts in
  `apps/gui/src/components/layout/`. Macro layouts MUST align with
  `.specs/design/layout-manifest.md`.

## 2. Accessibility (a11y)

- **Minimum Target**: WCAG 2.1 AA.
- **Forms**: All inputs MUST have an associated label. Use `aria-describedby`
  for errors.
- **Keyboard Navigation**: Ensure all paths are keyboard-navigable. Never
  suppress `focus-visible:ring-2` styling.
- **Color Contrast**: 4.5:1 minimum text-to-background contrast ratio (3:1 for
  large graphical text).

## 3. Responsive Design

- **Mobile-First**: Design for narrow widths (`320px-375px`) first, scale up via
  Tailwind breaks (`md:`, `lg:`).
- **No Overflow**: Prevent accidental horizontal scrollbars. Contain wide table
  content inside horizontal scrolling wrappers.

## 4. Micro-interactions & Polish

- **States**: Enforce distinct `hover:`, `focus:`, and `active:` states.
- **Direct Manipulation**: Favor inline edits or drag layouts over disconnected
  forms.
- **Intentional Motion**: Use native Browser View Transitions over heavy JS
  libraries.
  - Directional slides only for depth transitions (list -> detail).
  - Tab switching must fade or jump instantly.
- **Loading & Errors**: Use Skeletons to block layout shift. Expose Retry
  states.

## 5. Visual Hierarchy & Spacing

- **Typography Metric**: Map `h1`-`h6`, `body`, and `small`. Pair distinct
  display fonts with readable body text. Avoid generic AI fonts unless matching
  brand guidelines exactly.
- **Composition**: Embrace functional grouping and intentional whitespace
  proximity. Break symmetry for high-impact landing layouts.

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
