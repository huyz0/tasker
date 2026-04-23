---
epic: EPIC-0014
title: "QA Test Plan — Comments and Markdown Support"
status: approved
created_at: 2026-04-05
---

# QA Test Plan — Comments and Markdown Support

## Automated Testing Strategy
1. **Unit Tests (Vitest):** Core CQRS handlers (`CreateCommentHandler`, `GetCommentHandler`). Markdown parsing edge cases.
2. **Integration Tests (Vitest & DB):** End-to-end database writes/reads to the polymorphic comments table. Test NATS event emission on comment creation.
3. **E2E Tests (Playwright):** Creating a comment through the GUI, verifying markdown rendering in the Task display, verifying AI notes styling.

## Given / When / Then Scenarios

### Scenario 1: Creating a Task Comment
- **Given** I am viewing a Task
- **When** I enter "This is a **bold** comment" and submit
- **Then** the comment is saved and displayed with the word 'bold' rendered in bold text.

### Scenario 2: Agent Appends Reasoning
- **Given** an Agent is executing a routine on a Task
- **When** the Agent pushes an internal thought using the `TaskNote` TypeSpec API
- **Then** the UI distinctly renders the thought as an "AI Reasoning" block rather than a standard user chat bubble.

### Scenario 3: Artifact Commenting
- **Given** I am viewing an Artifact
- **When** I comment on the artifact and refresh the page
- **Then** my comment persists and remains attached exclusively to that artifact.
