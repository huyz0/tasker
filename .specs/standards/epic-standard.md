# Epic Standard

This document outlines the strict standard for defining and managing epics within the project. Epics represent large bodies of work and must contain sufficient context to ensure alignment, clear scope, and defined completion criteria.

## 1. Storage and Location
- **Directory**: All epics MUST be stored in the `.epics/` directory at the root of the project.
- **Folder Structure**: Each epic MUST be contained within its own folder.
- **Folder Naming Convention**: `EPIC-<id>-<kebab-case-title>` (e.g., `EPIC-0001-user-authentication`).
- **File Name**: The main definition file inside the folder MUST be explicitly named `EPIC.md`.

## 2. File Format and Metadata
- **Markdown**: The `EPIC.md` file MUST be written in Markdown.
- **YAML Frontmatter**: Every `EPIC.md` file MUST contain YAML frontmatter at the top of the document to provide essential metadata.
- **Required Metadata Fields**:
  - `status`: The current state of the epic. Allowed values: `todo`, `in-progress`, `done`.
  - `designs`: Status of design artifact generation (`architecture`, `ux`, `qa_plan`). Allowed values: `pending`, `completed`, `n/a`.
  - `design_reviews`: Status of the design peer reviews (`architecture`, `ux`, `qa_plan`). Allowed values: `pending`, `approved`, `rejected`, `n/a`.
  - `reviews`: Status of post-implementation code reviews (`code`, `security`, `qa_implement`, `architecture_code`). Allowed values: `pending`, `approved`, `rejected`, `n/a`.
  - `title`: The human-readable title of the epic.
  - `created_at`: The creation date (YYYY-MM-DD).

## 3. Required Epic Structure
To ensure high-quality epics, the `EPIC.md` file MUST follow this exact structure:

### 1. Context & Objective
Why are we building this? Describe the business value, the problem being solved, and the target audience.

### 2. Scope
- **In Scope**: Explicitly define what features and capabilities are included.
- **Out of Scope**: Explicitly define what is NOT included to prevent scope creep.

### 3. Dependencies
List any external or internal dependencies that block or affect this epic (e.g., "Requires completion of EPIC-0002" or "Waiting on third-party API keys").

### 4. Technical Approach (Optional but Recommended)
A brief overview of the implementation strategy. If complex, link out to a dedicated architecture or design artifact.

### 5. Definition of Done (Acceptance Criteria)
A detailed checklist that must be completed before the epic is considered `done`. This should include:
- Feature completions
- Testing requirements (e.g., E2E coverage)
- Documentation requirements
- Deployment milestones

### 6. Task Breakdown
A checklist of sub-tasks or stories that make up the epic. Use standard GitHub markdown checkboxes (`- [ ]`).

## 4. Version Control
- **Git Managed**: Epics are treated as code and MUST be committed to the repository. This guarantees that scope definitions naturally version alongside the codebase.

## Example `EPIC.md` Skeleton

```markdown
---
status: todo
designs:
  architecture: pending
  ux: pending
  qa_plan: pending
design_reviews:
  architecture: pending
  ux: pending
  qa_plan: pending
reviews:
  code: pending
  security: pending
  qa_implement: pending
  architecture_code: pending
title: User Authentication
created_at: 2026-03-30
---

# User Authentication

## Context & Objective
Users need a way to securely log in to save their preferences and access restricted resources.

## Scope
### In Scope
- Email/Password registration and login.
- JWT-based session management.
- "Forgot Password" flow.

### Out of Scope
- OAuth/Social Logins (Google, GitHub) - handled in a future epic.
- Two-Factor Authentication (2FA).

## Dependencies
- Requires setting up the PostgreSQL database (`EPIC-0001-database-setup`).
- Needs SMTP credentials from DevOps.

## Technical Approach
We will use secure hashing (Argon2) and implement stateless JWT access tokens with Refresh token rotation.

## Definition of Done
- [ ] Backend auth endpoints (`/register`, `/login`, `/refresh`) are implemented and tested.
- [ ] Frontend integration with React Context for auth state works perfectly.
- [ ] At least 80% test coverage for the auth module.
- [ ] Security review passed.

## Task Breakdown
- [ ] Setup User Database Schema
- [ ] Implement JWT Issue/Verify logic
- [ ] Build Frontend Login Page
```
