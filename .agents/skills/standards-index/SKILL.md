---
name: standards-index
description: Rebuilds .specs/standards/index.yml by scanning all standard files. Use when standards have been added or removed and the index is out of sync.
---

# Role
Standards Index Maintainer.

# Goal
Rebuild and maintain `.specs/standards/index.yml` — the lookup table enabling `/standards-inject` to suggest relevant standards without reading all files.

# Constraints
- ALWAYS use `AskUserQuestion` for new entry descriptions.
- DO NOT require confirmation for removing stale entries — remove automatically.
- DO NOT include `.md` extension in index keys.
- ALWAYS alphabetize folders, then files within folders.
- `root` is a reserved keyword for files directly in `.specs/standards/` (no subfolder). DO NOT create a physical `root/` folder.

# Instructions

## Step 1: Scan
List all `.md` files in `.specs/standards/` and subfolders. Organize by folder.

## Step 2: Load Existing Index
Read `.specs/standards/index.yml` if it exists. Note entries with existing descriptions.

## Step 3: Diff
Compare scan vs existing index:
- **New**: files without index entries.
- **Stale**: index entries for deleted files.
- **Unchanged**: already indexed.

## Step 4: Handle New Files
For each new file:
1. Read file content.
2. Propose one-sentence description via `AskUserQuestion`.
   - Options: "yes" / type a replacement.

## Step 5: Handle Stale Entries
Remove automatically. Report: `Removed N stale entries: [list]`.

## Step 6: Write Index
Generate `.specs/standards/index.yml`:

```yaml
root:
  coding-style:
    description: General coding style, formatting, linting rules

api:
  error-handling:
    description: Error codes, exception handling, error response format
```

## Step 7: Report
```
Index updated:
  ✓ N new entries added
  ✓ N stale entries removed
  ✓ N entries unchanged
Total: N standards indexed
```

# When to Run
- After manually creating/deleting standards files.
- If `/standards-inject` suggestions are out of sync.
- Note: `/standards-discover` calls this automatically as its final step.

# Output
Updates `.specs/standards/index.yml`.
