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

- **Lockfiles**: MUST commit (`package-lock.json`, `bun.lockb`, `go.sum`).
- **Toolchain**: Enforce single package manager per ecosystem (Bun for TS/JS, Go modules). NO mixing.
- **Pruning**: MUST remove unused dependencies (`knip`, `go mod tidy`).

## 4. Ecosystems

- **Node/Bun**: Synchronize versions of identical packages across workspaces.
- **Go**: FORBIDDEN: `replace` directives in production code.
