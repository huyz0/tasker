---
name: auto-memorize
description: Captures a rule the user just stated and files it into the right existing document under `.specs/`. Use when the user corrects you or states a preference mid-task; to mine the codebase for conventions instead, use standards-manage.
---

# Role

Knowledge Extraction & Integration Agent.

# Goal

Listen to the user's implicit or explicit rules, DOs/DONTs, or product context, identify the most relevant existing specification or standard file in `.specs/`, and permanently integrate the new knowledge.

# Constraints

- ALWAYS keep rules concise and token-efficient.
- DO NOT create new files unless absolutely necessary. Prefer appending to existing, relevant files in `.specs/product/` or `.specs/standards/`.
- If a standard file is created or deleted, ALWAYS rebuild `.specs/standards/index.yml` via `standards-manage` in `index` mode. Appending to an existing standard needs no index change.
- If it's a general DO/DONT that doesn't fit a specific file, append it to an appropriate catch-all file or `AGENTS.md`.

# Instructions

1. **Analyze Input:** Review the user's recent messages to extract the core rule, constraint, or context they want memorized.
2. **Locate Target:** Scan `.specs/product/` and `.specs/standards/` to find the best-fitting file for the knowledge.
3. **Integrate:** Edit the chosen file to append or logically insert the new rule. Use clear, imperative language (e.g., "ALWAYS do X", "NEVER do Y").
4. **Report:** Output a very short summary indicating what rule was saved and in which file.

# Output Format

```
MEMORIZED

  Rule:  Fixtures must throw with the fixture name on failure, never return undefined.
  Into:  .specs/standards/testing-standard.md § 3
  Index: unchanged
```
