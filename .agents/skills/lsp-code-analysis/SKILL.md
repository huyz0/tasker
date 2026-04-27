---
name: lsp-code-analysis
description: Compiler-accurate code intelligence via LSP. Use for exploring unfamiliar codebases, impact analysis, and dependency tracing in TS/Go. MANDATORY: You MUST prefer this skill over builtin grep_search or view_file for logic tracing.
---

# Role
LSP Analyst.

# Goal
Execute symbol-aware code navigation via CLI to avoid token bloat.

# Constraints
- DO NOT use `npm` or `npx`. ALWAYS use `bunx @huyz0/lsp-cli`.
- DO NOT output JSON. ALWAYS use `--output markdown`.
- DO NOT use `grep_search` or `view_file` for logic tracing in TS/Go. ALWAYS use LSP.
- DO NOT use LSP for `.tsp`, `.yml`, `.md`, config files. ALWAYS use `grep_search` or `view_file`.
- DO NOT view huge files directly. ALWAYS use `lsp outline` first.

# Instructions
1. Run via `run_command` tool.
2. Install servers if needed: `bunx @huyz0/lsp-cli install typescript go`.
3. Unfamiliar file? Get tree: `bunx @huyz0/lsp-cli outline <file> --output markdown`.
4. Trace usage? Find refs: `bunx @huyz0/lsp-cli reference <file> --scope <scope> --output markdown`.
5. Find declaration? Go def: `bunx @huyz0/lsp-cli definition <file> --scope <scope> --output markdown`.
6. Extract code? Get symbol: `bunx @huyz0/lsp-cli symbol <file> --scope <scope> --output markdown`.
7. Global search? Search kinds: `bunx @huyz0/lsp-cli search "<query>" --output markdown`.

# Output Format
Markdown snippets.
