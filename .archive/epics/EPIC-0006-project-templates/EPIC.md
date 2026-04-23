---
status: done
designs:
  architecture: completed
  ux: n/a
  qa_plan: completed
design_reviews:
  architecture: approved
  ux: n/a
  qa_plan: approved
reviews:
  code: approved
  security: approved
  qa_implement: approved
  architecture_code: approved
created_at: 2026-04-02
---

# Project Templates & Instances

## Context & Objective
Tasker requires the ability to spin up new Projects quickly for Teams. The solution is Project Templates. Project Templates define the base task types (including standard root task types like Epics) and default workflows. Projects are instances derived from these templates, with assigned owners. This satisfies Phase 1 (MVP) roadmap items.

## Scope
### In Scope
- Define `project_templates` schema.
- Define `projects` schema derived from templates and linked to `organizations`.
- Establish relationship between projects and `users` (owner assignments).
- Update Connect-RPC `main.tsp` with ProjectTemplateService and ProjectService.
- Update Backend handler to create and query Project Templates and Projects.

### Out of Scope
- Projects spanning multiple repositories.
- Custom template visual editor.

## Dependencies
- EPIC-0004 (Auth & Orgs)
- EPIC-0005 (Task Types)

## Technical Approach
- Define Drizzle schemas for `project_templates` and `projects`.
- Add `ProjectTemplateService` and `ProjectService` in `main.tsp`.
- Implement Zod validation in Bun backend handlers for creation.

## Definition of Done
- DB schemas migrated for `project_templates` and `projects`.
- Backend endpoints handle CRUD.
- Tested locally.

## Task Breakdown
- [x] Create Drizzle schemas.
- [x] Update `main.tsp`.
- [x] Implement backend Connect-RPC endpoints in `index.ts`.
