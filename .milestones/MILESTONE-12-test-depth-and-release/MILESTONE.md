---
id: M12
title: Test Depth & Release
status: todo
goal: The seam between client and server is genuinely tested, the core user journeys are covered end to end, and the product is distributable.
depends_on: [M06, M09, M11]
surfaces: [gui, backend, cli, infra]
exit_criteria_met: false
started_at: null
completed_at: null
---

# M12 — Test Depth & Release

## 1. Goal

A change that breaks the contract between the browser and the server fails a
test rather than reaching a user. The journeys a real person performs are
covered end to end against a real server. The CLI ships as versioned binaries
and the documentation is sufficient to onboard a human or an agent without
reading source.

## 2. Why Now

It is last because it certifies everything before it. The structural test gap —
that no test in the repository crosses the real wire, because the GUI mocks the
generated contract module, the backend calls handlers directly, and the CLI
talks to a fake server — is best closed once the contract has stopped moving,
which is after M10's authorization rewrite and M09's packaging work.

## 3. Exit Criteria

- [ ] At least one test suite exercises real protobuf serialization from a real
      client to a real server process.
- [ ] The GUI's tests no longer mock the generated contract module; requests are
      intercepted at the network layer.
- [ ] End-to-end tests cover: sign in, create org, create project, create task,
      assign it, comment, search, find it, and archive it.
- [ ] The CLI is released as signed, versioned binaries for three platforms.
- [ ] CLI statement coverage is at or above 80%.
- [ ] Quickstart, agent integration and CLI reference documentation exist and are
      verified by following them on a clean machine.
- [ ] A changelog is generated from conventional commits on release.

## 4. Scope

**In Scope**: network-level mocking in GUI tests, a wire-level integration
suite, the E2E journey suite and its fixtures, CLI coverage, GoReleaser,
release automation, documentation.

**Out of Scope**: load testing (M07 owns the performance budget), chaos testing,
visual regression beyond the accessibility gate from M06.

## 5. Task Breakdown

- [ ] **M12-T01** — Replace the `health_pb` module mock in GUI tests with
      network-level interception, so requests are serialized as in production.
      - Files: `apps/gui/src/setupTests.ts`, all feature tests
      - Verify: renaming a contract field fails a GUI test.

- [ ] **M12-T02** — Add a wire-level integration suite that boots the real server
      and drives it with the real generated client.
      - Files: `apps/backend/src/test/wire/`, `apps/backend/moon.yml`
      - Verify: the interceptor chain, CORS and revocation are exercised.

- [ ] **M12-T03** — Add contract round-trip tests asserting every RPC's request
      and response models serialize and deserialize without loss.
      - Files: `packages/shared-contract/` tests
      - Verify: an incompatible field-number change fails.

- [ ] **M12-T04** — Build deterministic E2E fixtures: a seeded database snapshot
      restored before each run.
      - Files: `apps/gui/tests/e2e/fixtures/`, `apps/backend/scripts/seed.ts`
      - Verify: E2E runs are repeatable and order-independent.

- [ ] **M12-T05** — Write the core journey E2E specs listed in the exit criteria.
      - Files: `apps/gui/tests/e2e/journeys/`
      - Verify: each journey passes headless in CI.

- [ ] **M12-T06** — Raise CLI statement coverage to 80% with a CI gate.
      - Files: `apps/cli/cmd/*_test.go`, `apps/cli/moon.yml`
      - Verify: `go tool cover` reports 80% or higher and CI enforces it.

- [ ] **M12-T07** — Add GoReleaser configuration and a tag-triggered release
      workflow producing binaries for linux, macOS and Windows.
      - Files: `.goreleaser.yml`, `.github/workflows/release.yml`
      - Verify: a tag produces attached artifacts.

- [ ] **M12-T08** — Rename the CLI binary to `tasker` and update every reference.
      - Files: `apps/cli/cmd/root.go`, `apps/cli/moon.yml`, docs
      - Verify: `tasker --help` matches the documentation.

- [ ] **M12-T09** — Write the quickstart, agent integration guide and CLI
      reference, and verify each on a clean machine.
      - Files: `docs/`, `README.md`
      - Verify: a fresh reader reaches a working setup from the docs alone.

- [ ] **M12-T10** — Generate a changelog from conventional commits and publish it
      with each release.
      - Files: `.github/workflows/release.yml`, `CHANGELOG.md`
      - Verify: a release contains a populated changelog.

- [ ] **M12-T11** — Final pass: mark the roadmap's delivered items, close every
      milestone, and record the state of the product in `.milestones/STATE.md`.
      - Files: `.specs/product/roadmap.md`, `.milestones/STATE.md`
      - Verify: no milestone remains `in-progress`.

## 6. Verification

```bash
moon check --all
moon run backend:test-wire
moon run gui:e2e
cd apps/cli && go test ./cmd/... -cover
```

## 7. Risks

Removing the contract-module mock from the GUI tests will break many of them at
once, because the mocks currently paper over shape mismatches. Expect this task
to surface real defects — budget for fixing them rather than restoring the mock.
