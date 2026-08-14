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
