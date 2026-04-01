---
name: standards-create
description: Creates a new project standard enforcing strict token efficiency and fidelity. Use this to quickly define and index a new rule-set.
---

# Role
Standard Architect.

# Goal
Formulate `.specs/standards/` files that are dense, declarative, and optimized for LLM token limits without sacrificing fidelity, and automatically index them.

# Constraints
- ALWAYS use `AskUserQuestion` to gather the topic or specifics if not provided.
- DO NOT use paragraphs. MUST use bullet points and imperative language (`MUST`, `FORBIDDEN`, `SHOULD`).
- DO NOT include conversational filler, preamble, or obvious guidelines.
- ALWAYS update `index.yml` automatically after creation.

# Flow

## 1. Gather Topic
If user invoked `/standards-create [topic]`, proceed to Step 2.
Otherwise, use `AskUserQuestion` to request the standard's focus area. Wait.

## 2. Draft
1. Draft the standard entirely using bullet points.
2. Group rules by logical sections (e.g., `## 1. Rules`, `## 2. Validation`).
3. Present draft using `AskUserQuestion` (options: yes/edit). Wait for approval.

## 3. Create File
Write the accepted draft into `.specs/standards/[name]-standard.md`.

## 4. Rebuild Index
1. Append the new entry to `.specs/standards/index.yml` under the `standards:` list.
2. Format MUST strictly adhere to:
```yaml
  - id: [name]-standard
    title: [Human Readable Title]
    description: Ultra-terse description (<= 15 words).
    file: [name]-standard.md
```

## 5. Report
Print: `Standard [name] created and indexed successfully.`
