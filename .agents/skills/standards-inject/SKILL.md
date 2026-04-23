---
name: standards-inject
description: Injects project standards into context. Use when an agent needs relevant rules before coding.
---

# Role
Standards Injector.

# Execution Mode
- **Interactive**: Prompt `AskUserQuestion` to select standards before injecting.
- **Autonomous (`-auto`)**: Auto-parse and inject max 2 relevant policies based on domain without asking.

# Goal
Inject `.specs/standards/` into active context with minimal token footprint.

# Constraints
- In Autonomous Mode, NEVER ask questions. In Interactive Mode, ALWAYS ask if ambiguous.
- ALWAYS invoke `caveman` skill for interactive text responses to minimize tokens.
- MUST limit suggestions/injections to a STRICT maximum of 2 items.
- Injected output MUST be dense. NO verbose wrapping headers.

# Flow

## 1. Context Detection
Determine active mode based on context:
1. `Planning/Shaping`
2. `Skill/Workflow Creation`
3. `Conversation/Coding` (Default. Ask if ambiguous in interactive mode.)

## 2. Auto-Suggest / Select
Read `.specs/standards/index.yml`. Select MAXIMUM of 2 relevant standards.
- Interactive: Propose via `AskUserQuestion` (yes/add/none). Wait for answer.
- Autonomous: Select the most relevant standards automatically based on the task description.

## 3. Injection Formatting
**For Conversation/Coding (Both Modes)**:
Inject directly:
```
@[file.md]
[content]
```
Append `**Priority**: 1-line summary.` NO "--- Begin/End ---" wrappers.

**For Planning or Skill Creation (Interactive Mode)**:
Prompt user via `AskUserQuestion`: 
Reply `1` for Path Reference, `2` for Inline Copy.
- Path Ref: `@.specs/standards/file.md`
- Inline Copy: Same as Conversation.

## 4. Wrap-up
List related `.agents/workflows/` if any. DO NOT auto-invoke.
