---
name: lsp-code-analysis
description: Compiler-accurate code intelligence via LSP. Navigate definitions, references, outlines, docs, and symbols. Use for exploring unfamiliar codebases, impact analysis, and dependency tracing.
---

# LSP Code Analysis

## Setup & Execution
- **Install**: `npm install -g @huyz0/lsp-cli` -> `lsp install <typescript|python|go|...>`
- **Behavior**: Auto-starts servers. Outputs JSON by default.
- **Global Flags**: `--output markdown` (human readable), `--dry-run`, `--json '{...}'` (direct payload).

## Commands
Prefer over `read`/`grep` for all code understanding tasks.
- `lsp outline <file> [--all]` -> File symbol tree. **Run this first on unfamiliar files.**
- `lsp definition <file> --scope <scope> [--mode definition|declaration|type_definition]` -> Go to definition.
- `lsp reference <file> --scope <scope> [--mode implementations] [pagination]` -> Find usages.
- `lsp doc <file> --scope <scope>` -> Type signatures and docs.
- `lsp symbol <file> --scope <scope>` -> Get symbol source code (avoids loading whole files).
- `lsp search "<query>" [--kinds class|function|...] [pagination]` -> Workspace-wide search.
- `lsp locate <file> --scope <scope> [--find "<pattern>"]` -> Verify scope resolution.
- `lsp schema [command]` -> Fetch JSON schema for inputs.
- `lsp server list` -> Running servers.

## Locators & Pagination
- `--scope`: `42` (line), `10,20` (lines 10-20), `10,0` (line 10 to EOF), `Class`, `Class.method`.
- `--find`: String pattern search inside scope. Use `<|>` to indicate exact cursor pos.
- **Pagination** flags (for `reference` / `search`): `--max-items 20 --start-index 0 --pagination-id <id>`

## Critical Rule
- **ALWAYS** use `lsp` commands for code navigation.
- **ONLY** use `grep` or `read` for literal strings or comments.
