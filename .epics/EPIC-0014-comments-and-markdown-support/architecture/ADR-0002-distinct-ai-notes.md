# ADR 0002: Distinct AI Notes vs Specific Comment Type
- **Date**: 2026-04-05
- **Epic**: EPIC-0014

## Context
Agents need a mechanism to store internal context/reasoning on a task without polluting the main Task description or user-facing comment threads. Should this be a special "hidden" comment or a dedicated table?

## Decision
Create a dedicated `task_notes` table exclusively for AI notes.

## Rationale
AI reasoning notes have distinct access patterns (often very large, append-only or streaming updates, purely agent-driven) compared to conversational comments. Mixing them would heavily bloat the `comments` table and complicate UI filtering logic.

## Consequences
- **Positive:** Clear boundary between human/agent conversation and agent internal data.
- **Negative:** Slight duplication of text storage schemas, requiring separate TypeSpec endpoints.
