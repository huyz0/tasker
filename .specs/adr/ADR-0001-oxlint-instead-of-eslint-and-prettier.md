---
id: ADR-0001
status: accepted
date: 2026-08-15
milestone: M02
---

# Use oxlint alone instead of ESLint plus Prettier

## Context

`tech-stack.md` named ESLint, Prettier and Stylelint before this milestone. None
of the three is installed. What exists is `oxlint` ^1.61.0, declared once at the
workspace root and invoked as `oxlint .` from `apps/backend/package.json` and
`apps/gui/package.json`.

The gap was never decided; it was arrived at. This ADR records the choice
retroactively so the next agent stops reaching for an ESLint plugin that has no
host.

The forces:

- The repository is a monorepo with three languages. Go already has `gofmt` and
  `go vet` (`cli:format`, `cli:vet`). Only the TypeScript side was undecided.
- `moon check --all` runs on every pre-commit hook. Lint latency is paid by a
  human, dozens of times a day.
- Agents write most of the code here. A linter's value is the rules it enforces
  automatically, not the ones a reviewer could have mentioned.

## Options

**ESLint + `typescript-eslint` + Prettier.** The default. Widest rule coverage,
every rule documented, type-aware linting available. Costs three tool
configurations, a plugin resolution graph that breaks on major versions, and
seconds-to-minutes of lint time on a monorepo. Prettier and ESLint must then be
reconciled so they stop fighting over formatting.

**Biome.** One binary for lint and format, fast, actively developed. A real
alternative, rejected only because oxlint was already in the tree and switching
would have been a change without a complaint driving it.

**oxlint alone.** One Rust binary, no plugin graph, runs in well under a second
across the workspace. Fewer rules than ESLint, and **no type-aware rules at
all** — it does not run the TypeScript compiler.

## Decision

Use `oxlint` as the only TypeScript linter, with no separate formatter.

## Consequences

**Easier.** Lint is effectively free inside the pre-commit hook, so the gate
stays enabled rather than becoming the check people bypass. There is one tool to
configure, and today it runs on defaults — no `.oxlintrc.json` exists anywhere in
the repository.

**Harder.** Type-aware rules are unavailable: `no-floating-promises`,
`no-misused-promises` and the rest of the rules that need the type-checker
cannot be enforced. `moon check` runs `tsc` separately, which catches type
errors but not these patterns. The `any` in handler signatures
(`db: any`, `contextValues: any`) would be flagged by a type-aware rule set and
is not flagged today.

**Foreclosed.** No formatter runs. Formatting is whatever the author or agent
emitted, which is why line-level style varies between modules. Adopting one
later is cheap; the diff it produces is not.

**Revisit** if the missing type-aware rules are implicated in a real defect, or
when a formatter's absence starts showing up in review comments. No milestone
owns this today.
