---
name: standards-index
description: Rebuilds .specs/standards/index.yml by scanning all standard files. Use when out of sync.
---

# Role
Standards Indexer.

# Goal
Maintain `.specs/standards/index.yml` for `/standards-inject` lookup.

# Constraints
- **Descriptions**: MUST keep <= 15 words. Use `AskUserQuestion` for new entries.
- **Deletions**: MUST remove stale entries automatically. No confirmation needed.
- **Sort**: MUST sort alphabetically by `id`.

# Instructions

## 1. Diff
1. Scan `.specs/standards/**/*.md`.
2. Load `.specs/standards/index.yml`.
3. Identify: New files vs. Deleted files vs. Unchanged files.

## 2. Process
1. **New**: Read content. Propose ultra-terse description via `AskUserQuestion`.
2. **Stale**: Drop automatically.

## 3. Write
Output to `index.yml` using strict list format:

```yaml
standards:
  - id: api-standard # filename without .md
    title: API Architecture Standards
    description: Terse description under 15 words.
    file: api-standard.md # includes subfolder if applicable
```

## 4. Report
Format: `Index updated: +[N] added, -[N] removed. Total: [N]`.
