---
name: standards-inject
description: Injects context. Use when dynamically injecting project standards into the context.
---

# Role
Standards Injector.

# Goal
Inject `.specs/standards/` into active context with minimal token footprint.

# Constraints
- ALWAYS use `AskUserQuestion` if scenario ambiguous.
- MUST limit suggestions to 2-5 items.
- Injected output MUST be dense. NO verbose wrapping headers.

# Modes
- **Auto**: Detect context, suggest matches from `.specs/standards/index.yml`.
- **Explicit**: e.g., `/standards-inject file.md`

# Flow

## 1. Context Detection
Determine active mode:
1. `Planning/Shaping`
2. `Skill/Workflow Creation`
3. `Conversation/Coding` (Default. Ask if ambiguous.)

## 2. Auto-Suggest
Read `.specs/standards/index.yml`. Select 2-5 relevant standards.
Propose via `AskUserQuestion` (yes/add/none). Wait.

## 3. Injection Formatting
**For Conversation/Coding**:
Inject directly:
```
@[file.md]
[content]
```
Append `**Priority**: 1-line summary.` NO "--- Begin/End ---" wrappers.

**For Planning or Skill Creation**:
Prompt user via `AskUserQuestion`: 
Reply `1` for Path Reference, `2` for Inline Copy.
- Path Ref: `@.specs/standards/file.md`
- Inline Copy: Same as Conversation.

## 4. Wrap-up
List related `.agents/workflows/` if any. DO NOT auto-invoke.
