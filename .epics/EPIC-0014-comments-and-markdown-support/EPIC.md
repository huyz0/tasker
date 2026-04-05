---
status: done
designs:
  architecture: completed
  ux: completed
  qa_plan: completed
design_reviews:
  architecture: completed
  ux: completed
  qa_plan: completed
reviews:
  code: completed
  security: completed
  qa_implement: completed
  architecture_code: completed
created_at: 2026-04-05
---

# Comments and Markdown Support

## Context & Objective
Communication and structured collaboration are central to Tasker's mission of seamlessly integrating AI agents and human users. As the final major pillar of the Phase 1 (MVP) Product Roadmap, this epic introduces robust commenting systems across tasks and artifacts, dedicated AI notes functionality, and rich Markdown rendering capabilities across the entire application interface. Completion of this epic finalizes the MVP and preps the platform for Phase 2 repository integrations.

## Scope
### In Scope
- **Task Comments:** Implement full CRUD logic and database schema extensions for commenting on Tasks.
- **Artifact Comments:** Implement comments structurally linked to Artifacts.
- **Task AI Text Notes:** Build a specific note-taking mechanism or entity extension dedicated to agents keeping internal context within a task.
- **Markdown Support:** Implement full GitHub-Flavored Markdown parsing and rendering for text artifacts, task descriptions, AI notes, and comments across the GUI.
- **CLI Utilities:** Supplement the CLI commands to view and add comments to tasks and artifacts.

### Out of Scope
- File attachments within comments (Wait for Phase 2 or separate media logic).
- Real-time/WebSocket notifications for comments (covered under MVP "real-time GUI", but specific ping mechanisms are out of scope here).
- Complex thread nesting (Only primary top-level comments or maximum one layer of replies).

## Dependencies
- **EPIC-0011**: Task and Agent Management (Done).
- **EPIC-0012**: Artifact Management (Done).
- **EPIC-0013**: Advanced Discovery and Search (Done - useful for paginating comments).

## Technical Approach
- **Database Layer**: Introduce or refine `comments` schema with a `target_type` (Task, Artifact) and `target_id` (Polymorphic association), or distinct tables depending on the established architecture (`comments_tasks`, `comments_artifacts`).
- **Domain Layer**: Enforce CQRS patterns, ensuring mutation (`CreateCommentHandler`) is decoupled from queries (`GetCommentsListHandler`).
- **Input Validation**: Handle potentially large text inputs using Zod, ensuring safe transport.
- **Frontend GUI**: Integrate `react-markdown` and `remark-gfm` components to safely render HTML. Implement secure sanitization logic (`rehype-sanitize`) to prevent XSS.
- **Testing**: End-to-end integration mapping creating a task, leaving comments, reading the task with markdown, and verifying output in both CLI and GUI.

## Definition of Done
- [x] Users and Agents can comment on Tasks and Artifacts via API and GUI.
- [x] AI Text Notes can be attached to Tasks systematically.
- [x] Markdown is fully rendered for artifacts, task descriptions, and comments in the application shell.
- [x] CLI supports querying and creating these conversational elements.
- [x] Implementation is thoroughly covered by Vitest backend tests and React component integration coverage.
- [x] No mocked logic; fully persisted to database.

## Task Breakdown
- [x] Design and implement database schema updates for Comments and AI Notes.
- [x] Add `Create/Update/Delete` CQRS commands and TypeSpec definitions for Task Comments.
- [x] Add `Create/Update/Delete` CQRS commands and TypeSpec for Artifact Comments.
- [x] Build API endpoints and database handlers for Task AI explicit text notes.
- [x] Implement CLI commands: `tasker comment add`, `tasker comment list`.
- [x] Install GUI dependencies (`react-markdown`, `remark-gfm`, `rehype-sanitize`).
- [x] Build robust reusable `MarkdownRenderer` React component in `apps/gui/...`.
- [x] Integrate React `MarkdownRenderer` into the Task Detail and Artifact viewers.
- [x] Build the interactive UI "Comment Section" component for Tasks and Artifacts.
- [x] Write E2E integration tests validating markdown persistence and comment CRUD across contexts.
