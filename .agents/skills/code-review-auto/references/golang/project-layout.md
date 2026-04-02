# Go Project Layout Code Review Standards

Adhere to idiomatic modular boundaries in Go applications.

## 1. Avoid Circular Dependencies
Go strictly forbids circular dependencies between packages.
- Ensure bounded contexts are kept clean. If Package A needs Package B, and Package B needs Package A, they either belong in the same package, or an interface needs to be introduced in a lower-level third package.

## 2. The `internal/` Directory
The `internal/` directory mechanism enforces visibility rules. Only code within the parent directory can import internal packages.
- Promote the use of `internal/` for business logic, preventing other external or adjacent domain bounded contexts from importing deeply coupled logic unnecessarily.
- **Review Action:** Point out if developers expose large public API surfaces where `internal/` packages would be more appropriate.

## 3. Package Names
Short, concise, and related to their purpose.
- Avoid utility drawers `utils/` or packages generically named `common/` or `helpers/`. Be specific: `stringutil/`, `math/`, `httphandler/`.
- The package name is part of the exported identifier (e.g. `http.Server` not `http.HTTPServer`). Review for stuttering.

## 4. `init()` Functions
Avoid using `init()` functions unless strictly necessary.
- `init()` functions execute deterministically but can cause hidden side-effects or initialization order dependencies.
- Prefer explicit configuration and setup functions called from `main`.
