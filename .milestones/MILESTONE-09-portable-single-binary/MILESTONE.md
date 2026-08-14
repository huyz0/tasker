---
id: M09
title: Portable Single Binary
status: todo
goal: One executable, run in an empty directory with no dependencies installed, serves the entire product.
depends_on: [M05, M07]
surfaces: [backend, gui, infra]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M09 — Portable Single Binary

## 1. Goal

Someone downloads a single file, runs it, opens a browser, and has a working
Tasker instance with an embedded database and full-text search. No Docker, no
MySQL, no Node, no separate frontend build. This is the first line of the
product roadmap's MVP and the strongest demonstration of the storage
abstraction the backend already carries.

## 2. Why Now

It depends on M05 (the GUI must be feature-complete before it is worth
embedding) and M07 (embedded search must be real, or the standalone mode ships
a weaker product than the clustered one). It should land before M10's schema
overhaul so the packaging work is not competing with a migration.

## 3. Exit Criteria

- [ ] `moon run backend:build-standalone` produces one file that, copied to an
      empty directory on a machine with no toolchain, serves the SPA and the API.
- [ ] The binary creates and migrates its own SQLite database on first run.
- [ ] Full-text search works in the binary with no external service.
- [ ] Configuration is read from a `.env` beside the binary and from flags.
- [ ] CI builds the binary, runs it in a temporary directory, and asserts the
      health endpoint and the index page respond.
- [ ] The literal placeholder HTML currently served at `/` is gone.
- [ ] The in-process transport is either implemented or deleted, with an ADR
      recording the decision.

## 4. Scope

**In Scope**: asset embedding, migration embedding, the static file server with
SPA fallback, CLI flags, the smoke test, cross-platform release artifacts.

**Out of Scope**: auto-update, installers, code signing.

## 5. Task Breakdown

- [ ] **M09-T01** — Embed migrations in the binary instead of reading
      `./drizzle-sqlite` from the working directory at runtime.
      - Files: `apps/backend/src/db/db.ts`, `apps/backend/src/db/migrations.ts`
      - Verify: the binary migrates from an empty directory.

- [ ] **M09-T02** — Build the GUI as part of the standalone build and embed
      `dist/` into the binary.
      - Files: `apps/backend/package.json`, `apps/backend/moon.yml`
      - Verify: the binary contains the asset bundle.

- [ ] **M09-T03** — Serve the embedded assets with correct content types, cache
      headers, and SPA history fallback; remove the placeholder HTML.
      - Files: `apps/backend/src/index.ts`, `apps/backend/src/lib/staticServer.ts`
      - Verify: a deep link like `/tasks/abc` loads the app, not a 404.

- [ ] **M09-T04** — Decide the in-process transport question in an ADR: implement
      a real Connect transport that bypasses the socket, or delete
      `localInProcessTransportRouter` and drop the claim from the specs.
      - Files: `.specs/adr/ADR-0010-standalone-transport.md`, `apps/backend/src/index.ts`
      - Verify: no unreferenced stub remains.

- [ ] **M09-T05** — Add `--port`, `--db`, `--open` and `--seed` flags with Zod
      validation, layered under the existing env configuration.
      - Files: `apps/backend/src/config.ts`, `apps/backend/src/index.ts`
      - Verify: `./tasker-standalone --port 9000` listens on 9000.

- [ ] **M09-T06** — Make standalone mode work without `ENABLE_TEST_LOGIN`: a
      first-run setup that creates the initial owner account locally.
      - Files: `apps/backend/src/modules/auth/`, `apps/gui/src/pages/Login.tsx`
      - Verify: a fresh binary reaches a usable session with no Google credentials.

- [ ] **M09-T07** — Add a CI smoke job: build, run in a temp directory, assert
      health and index, then terminate.
      - Files: `.github/workflows/ci.yml`, `scripts/smoke-standalone.sh`
      - Verify: the job fails if the asset bundle is missing.

- [ ] **M09-T08** — Produce release artifacts for linux, macOS and Windows.
      - Files: `.github/workflows/release.yml`
      - Verify: a tagged build attaches three binaries.

- [ ] **M09-T09** — Write the standalone quickstart.
      - Files: `docs/standalone.md`, `README.md`
      - Verify: a reader reaches a running instance from the document alone.

## 6. Verification

```bash
moon run backend:build-standalone
mkdir -p /tmp/tasker-smoke && cd /tmp/tasker-smoke
cp <repo>/apps/backend/dist/tasker-standalone .
./tasker-standalone &
curl -sf localhost:8080/ | grep -q '<div id="root"'
```

## 7. Risks

`bun build --compile` has limits on what it will embed; verify asset embedding
early in the milestone rather than at the end. If the bundler cannot carry the
assets, the fallback is a sidecar directory extracted on first run — acceptable,
but it changes the "single file" claim and must be reflected in the specs.
