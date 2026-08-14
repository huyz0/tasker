---
id: M01
title: Stabilize the Build
status: in-progress
goal: Every feature that already exists works end to end from a clean clone, and CI fails when one of them breaks.
depends_on: []
surfaces: [gui, backend, cli, infra]
exit_criteria_met: false
started_at: 2026-08-15
completed_at: null
---

# M01 — Stabilize the Build

## 1. Goal

A developer or agent who clones this repository can run one documented command
and reach a working application, and every navigable path in that application
renders something. CI runs every test suite the repository contains, so a
regression in any surface fails the pipeline rather than sitting undetected.

## 2. Why Now

Nothing else can be trusted until this holds. The GUI's 373 tests and its 95%
coverage gate exist but are never invoked by CI, which means every later
milestone would be building on an unverified surface. Three separate defects
(dead search navigation, a write-performing health probe, a broken dev
bootstrap) make the product look non-functional to anyone evaluating it, and
all three are small fixes. This milestone adds no features — it makes the
existing ones honest.

## 3. Exit Criteria

- [ ] A clean clone reaches a working GUI with a live session via the documented
      command, with no manual environment setup beyond copying `.env.example`.
- [ ] No URL reachable from the UI renders an empty content area; unknown routes
      render a Not Found view with a route back.
- [ ] `moon run gui:test`, `gui:e2e`, `backend:test`, `cli:test` all execute in CI
      on every pull request and block merge on failure.
- [ ] The health probe performs zero writes; running it 1,000 times leaves the
      database byte-identical apart from access timestamps.
- [ ] `moon setup` followed by `moon check --all` succeeds on a machine with only
      `moon` installed.
- [ ] `bunx knip` reports zero unused dependencies and zero unused files.
- [ ] Exactly one lockfile per ecosystem exists in the repository.

## 4. Scope

**In Scope**: routing repair, health probe, dev onboarding, CI wiring,
toolchain pinning, dead-code and dependency cleanup, test-fixture hygiene.

**Out of Scope**: new UI surfaces (M05), design token corrections (M06),
performance work (M07), any change to the specs' claims (M02).

## 5. Task Breakdown

- [x] **M01-T01** — Add `/tasks/:taskId` and `/artifacts/:artifactId` routes that
      open the corresponding detail view, driven by the URL rather than local state.
      - Files: `apps/gui/src/App.tsx`, `apps/gui/src/features/Tasks/index.tsx`,
        `apps/gui/src/features/Artifacts/index.tsx`
      - Verify: navigating directly to a task URL opens that task's detail;
        reloading the page keeps it open.

- [x] **M01-T02** — Add a `NotFound` view mounted on `*` inside the shell so no
      route renders blank, with a link back to the dashboard.
      - Files: `apps/gui/src/pages/NotFound.tsx`, `apps/gui/src/App.tsx`
      - Verify: `/nonsense` renders the Not Found view, not an empty pane.

- [x] **M01-T03** — Confirm every `GlobalSearch` result navigates to a view that
      renders the searched entity; add a test asserting navigation target
      resolves to a matched route.
      - Files: `apps/gui/src/components/layout/GlobalSearch.tsx`, its test
      - Verify: clicking a task result opens that task.

- [x] **M01-T04** — Make `ping()` read-only: query the FTS table (or `SELECT 1`)
      instead of inserting a probe row, and delete any probe rows a prior build left.
      - Files: `apps/backend/src/modules/health/health.handler.ts`, a cleanup migration
      - Verify: `SELECT count(*) FROM search_index` is unchanged after 100 pings.

- [x] **M01-T05** — Make the documented dev command produce a logged-in app:
      set `ENABLE_TEST_LOGIN` in `scripts/dev.sh`, commit `.env.example` for both
      apps, and correct the README's setup section.
      - Files: `scripts/dev.sh`, `apps/backend/.env.example`,
        `apps/gui/.env.example`, `README.md`
      - Verify: fresh clone → `moon run dev` → dashboard loads with data, no console 403.

- [x] **M01-T06** — Add `gui:test` to the GUI CI job so the existing suite and its
      95% coverage threshold gate merges.
      - Files: `.github/workflows/ci.yml`
      - Verify: a deliberately broken assertion fails CI.

- [x] **M01-T07** — Add a `gui:e2e` moon task and CI job: install Playwright
      browsers via `bunx playwright install --with-deps`, remove the hardcoded
      `executablePath`, boot the backend with a seeded database as a step.
      - Files: `apps/gui/playwright.config.ts`, `apps/gui/moon.yml`,
        `.github/workflows/ci.yml`
      - Verify: E2E job runs and passes on a pull request.

- [x] **M01-T08** — Delete the four unreachable specs in `apps/gui/e2e/`; port any
      still-valid intent into `apps/gui/tests/e2e/`.
      - Files: `apps/gui/e2e/*` (removed)
      - Verify: no spec file exists outside the configured `testDir`.

- [x] **M01-T09** — Align the Go toolchain: pin `.prototools` to the version
      `apps/cli/go.mod` requires and make CI use the pinned version rather than a
      floating minor.
      - Files: `.prototools`, `.github/workflows/ci.yml`
      - Verify: `moon setup && moon run cli:build` succeeds from clean.

- [x] **M01-T10** — Remove `apps/gui/package-lock.json` and add a lockfile rule to
      `dependency-standard.md` naming `bun.lock` as the only permitted JS lockfile.
      - Files: `apps/gui/package-lock.json` (removed), `.specs/standards/dependency-standard.md`
      - Verify: `find . -name 'package-lock.json' -not -path '*/node_modules/*'` is empty.

- [x] **M01-T11** — Install `knip`, add a `moon run :knip` task wired into
      `moon check`, and remove every dependency it reports as unused.
      - Files: `package.json`, `knip.json`, `moon.yml`
      - Verify: `bunx knip` exits zero.

- [x] **M01-T12** — Replace `try { … } catch {}` fixture blocks in backend tests
      with shared seeding helpers that fail loudly.
      - Files: `apps/backend/src/test/setup.ts`, affected `*.test.ts`
      - Verify: a deliberately broken fixture fails the test with a clear error.

- [x] **M01-T13** — Make the pre-commit hook active by default: add a
      `moon run setup-hooks` task that sets `core.hooksPath`, and call it from
      `moon setup` documentation.
      - Files: `moon.yml`, `README.md`
      - Verify: a fresh clone's first commit runs the hook.

## 6. Verification

```bash
moon setup
moon run setup-hooks
cp apps/backend/.env.example apps/backend/.env
moon check --all
bunx knip
moon run dev            # then click through every sidebar entry and a search result
```

## 7. Risks

Adding E2E to CI will expose flakiness that currently hides. Budget for
stabilising the two existing specs before adding more; if a spec proves
inherently flaky, delete it rather than retry-masking it. Rollback for this
milestone is trivial — every change is additive or a deletion of dead code.
