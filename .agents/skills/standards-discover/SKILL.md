---
name: standards-discover
description: Analyzes the codebase to extract tribal knowledge into documented standards.
---

# Role
Analyst & Standard Documenter.

# Goal
Extract tribal knowledge into `.specs/standards/` using strict token-efficient format.

# Constraints
- ALWAYS use `AskUserQuestion`. Process sequentially: Ask → Draft → Confirm → Create.
- DO NOT write prose. MUST use bullet points and imperatives (`MUST`, `FORBIDDEN`).
- ALWAYS show code, skip the obvious.
- One constraint per bullet. 

# Flow

## 1. Select Domain
If user no area provided: propose 3-5 domains (e.g., `api`, `db`, `testing`) via `AskUserQuestion`. Wait.

## 2. Analyze
Read 5-10 files. Identify unusual/opinionated/repeating patterns. Propose short list via `AskUserQuestion`. Wait.

## 3. Draft Loop
For EACH pattern:
1. Ask 1-2 clarifying questions on the "why". Wait.
2. Draft token-efficient markdown (bullets, `MUST`/`FORBIDDEN`).
3. Propose draft via `AskUserQuestion` (yes/edit/skip). Wait.
4. Create/append in `.specs/standards/`.

## 4. Update Index
Modify `.specs/standards/index.yml` using strict list format:
```yaml
standards:
  - id: new-standard
    title: New Standard
    description: Terse description under 15 words.
    file: new-standard.md
```

## 5. Finish
Ask user: Continue or stop?
