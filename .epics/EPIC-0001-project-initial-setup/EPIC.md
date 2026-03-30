---
status: todo
title: Project Initial Setup
created_at: 2026-03-30
---

# Project Initial Setup

## Context & Objective
The objective is to establish the complete foundational architecture and scaffolding for the `tasker` project. This includes setting up the bare minimum project structure for all core components: a React/Vite-based GUI, a Bun-based backend, a Golang CLI, and a shared TypeSpec API contract. Additionally, we need vital infrastructure like `.gitignore` rules and a GitHub Actions CI pipeline covering static analysis, linting, testing, and building.

## Scope
### In Scope
- Setup of `gui` sub-project (React/Vite).
- Setup of `backend` sub-project (Bun).
- Setup of `cli` sub-project (Go with Cobra boilerplate).
- Setup of `shared-contract` (TypeSpec).
- Comprehensive `.gitignore` covering Go, Node, Bun, and OS artifacts.
- GitHub Actions CI workflow for build, test, and lint across all three ecosystems.

### Out of Scope
- Full application logic implementation.
- Database migrations or schema generation.
- Production deployment or containerization (Docker).

## Dependencies
None identified.

## Technical Approach
We will utilize a monorepo-style structure. `apps/` will contain our runnable applications (`gui`, `backend`, `cli`). `packages/` or a dedicated `contracts/` directory will contain the shared TypeSpec definitions. We will configure a `.github/workflows/ci.yml` that sets up Go, Node, and Bun to run linting and tests in parallel.

## Definition of Done
- `apps/gui` has a basic Vite React TS setup.
- `apps/backend` has a basic Bun TS setup with a sample script.
- `apps/cli` has a Go module and generic Cobra command setup.
- `contracts` or `packages/shared-contract` contains an initial `main.tsp` TypeSpec file.
- `.gitignore` is populated with relevant ignore rules.
- `.github/workflows/ci.yml` exists and defines jobs for `gui`, `backend`, and `cli`.

## Task Breakdown
- [ ] Create `apps/gui` foundation
- [ ] Create `apps/backend` foundation
- [ ] Create `apps/cli` foundation
- [ ] Create shared TypeSpec contract foundation
- [ ] Create root `.gitignore`
- [ ] Set up `.github/workflows/ci.yml`
