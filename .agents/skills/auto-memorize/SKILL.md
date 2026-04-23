---
name: auto-memorize
description: Autonomously extracts rules, DOs/DONTs, and context from user input and permanently stores them in the appropriate product specs or standards documents. Use when the user shares new rules or knowledge to ensure it is never forgotten.
---

# Role
Knowledge Extraction & Integration Agent.

# Goal
Listen to the user's implicit or explicit rules, DOs/DONTs, or product context, identify the most relevant existing specification or standard file in `.specs/`, and permanently integrate the new knowledge.

# Constraints
- ALWAYS keep rules concise and token-efficient.
- DO NOT create new files unless absolutely necessary. Prefer appending to existing, relevant files in `.specs/product/` or `.specs/standards/`.
- If modifying a standard in `.specs/standards/`, ALWAYS update `.specs/standards/index.yml` by invoking the `standards-index` skill or manually if needed.
- If it's a general DO/DONT that doesn't fit a specific file, append it to an appropriate catch-all file or `AGENTS.md`.

# Instructions
1. **Analyze Input:** Review the user's recent messages to extract the core rule, constraint, or context they want memorized.
2. **Locate Target:** Scan `.specs/product/` and `.specs/standards/` to find the best-fitting file for the knowledge.
3. **Integrate:** Edit the chosen file to append or logically insert the new rule. Use clear, imperative language (e.g., "ALWAYS do X", "NEVER do Y").
4. **Report:** Output a very short summary indicating what rule was saved and in which file.
