---
name: markdown-lint
description: Lints Markdown and validates embedded Mermaid blocks deterministically via a bundled script. Use after generating or editing any Markdown artifact, when a machine-verifiable pass/fail is needed rather than a reading.
---

# Role

Deterministic Markdown Quality Gate enforcing structural lint rules and Mermaid diagram syntax correctness.

# Goal

Run the bundled Node.js linting script against one or more Markdown files and surface all lint violations and invalid Mermaid blocks as structured output so the caller can decide to fix or reject the content.

# Constraints

- DO NOT modify source files; this skill is read-only validation only.
- DO NOT skip the Mermaid validation phase even when lint phase passes.
- DO NOT rely solely on LLM judgement — always execute the script for a deterministic result.
- DO NOT proceed if `node` (v18+) is unavailable; report the missing runtime instead.
- ALWAYS resolve file paths relative to the project root (cwd).
- ALWAYS report both lint errors and Mermaid errors in the final summary.
- ALWAYS exit with a non-zero status code when any error is found so CI/CD pipelines fail correctly.

# Context

The script at `.agents/skills/markdown-lint/scripts/lint-markdown.mjs` resolves `markdownlint-cli2`, `@a24z/mermaid-parser` and `glob` from the workspace root, so `bun install` at the root is the only setup. It used to install them into a private `node_modules` under the skill, which produced a second committed lockfile that no build read and `knip` could not audit.

Rules come from `.markdownlint-cli2.jsonc` at the repository root. That file records which markdownlint defaults do not apply here and why — notably `MD025`, because the skill schema uses sibling `#` sections by design, and `MD029`, because skill steps are numbered across the whole file so `--fix` must not restart them per section.

Exit codes from the script:

- `0` – all checks passed
- `1` – lint or Mermaid errors found (content must be fixed)
- `2` – script execution error (runtime/dependency failure)

# Instructions

1. **Identify targets:** Determine which Markdown file(s) or glob pattern(s) to validate.
   - Default: `**/*.md` (entire project)
   - Milestone-scoped: pass the milestone folder, e.g. `.milestones/MILESTONE-04-*/**/*.md`
   - Single file: pass the exact relative path

2. **Run the script:**

   ```bash
   node .agents/skills/markdown-lint/scripts/lint-markdown.mjs [glob-or-file...]
   ```

   Example — validate every file in a milestone:

   ```bash
   node .agents/skills/markdown-lint/scripts/lint-markdown.mjs ".milestones/MILESTONE-04-*/**/*.md"
   ```

   Example — validate a single spec file:

   ```bash
   node .agents/skills/markdown-lint/scripts/lint-markdown.mjs ".specs/product/ARCHITECTURE.md"
   ```

3. **Interpret results:**
   - Exit `0`: Report `✓ PASS` — no action needed.
   - Exit `1`: Parse stdout/stderr for `LINT` and `MERMAID` prefixed lines. Report each error with its file path, line number, rule/description, and a quick-fix suggestion.
   - Exit `2`: Report the script error and prompt the user to check Node.js version (`node --version`, minimum v18).

4. **Fix loop (when errors exist):**
   - For `LINT` errors: apply the correction to the source file (respecting the rule description).
   - For `MERMAID` errors: re-examine the flagged diagram block and correct the syntax.
   - Re-run step 2 until exit code is `0`.

5. **Report summary:** Emit a structured summary block (see Output Format).

# Output Format

```
## Markdown Lint Report

**Files checked:** N
**Mermaid blocks:** N
**Status:** ✓ PASS | ✗ FAIL

### Lint Errors (N)
| File | Line | Rule | Description |
|------|------|------|-------------|
| path/to/file.md | 42 | MD022 | Headings should be surrounded by blank lines |

### Mermaid Errors (N)
| File | Line | Detail |
|------|------|--------|
| path/to/file.md | 78 | Invalid Mermaid syntax |

### Fix Actions Taken
- [description of each fix applied]
```
