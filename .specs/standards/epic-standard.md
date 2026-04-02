# Epic Standard

## 1. Storage & Organization

- **Path**: `.epics/` directory at project root.
- **Folder Format**: `EPIC-<id>-<kebab-case-title>` (e.g.,
  `EPIC-0001-user-auth`).
- **File Name**: `EPIC.md`.

## 2. Metadata (YAML Frontmatter)

Requires:

- `status`: `todo`, `in-progress`, `done`.
- `designs`: Status (`pending`, `completed`, `n/a`) for `architecture`, `ux`,
  `qa_plan`.
- `design_reviews`: Status (`pending`, `approved`, `rejected`, `n/a`) for
  `architecture`, `ux`, `qa_plan`.
- `reviews`: Status (`pending`, `approved`, `rejected`, `n/a`) for `code`,
  `security`, `qa_implement`, `architecture_code`.
- `title`: Human-readable name.
- `created_at`: YYYY-MM-DD.

## 3. Structure

### 1. Context & Objective

Business value, problem solved, and target audience.

### 2. Scope

- **In Scope**: Explicit inclusions.
- **Out of Scope**: Explicit exclusions.

### 3. Dependencies

Blockers or preconditions.

### 4. Technical Approach

Implementation strategy overview (or links to design docs).

### 5. Definition of Done

Checklist of required outcomes (testing, deployment, features).
**Strict Rule:** Implementations MUST be fully working, end-to-end logic. Hardcoded mocked responses or fake data layers are strictly forbidden.

### 6. Task Breakdown

Actionable `- [ ]` markdown checklist of sub-tasks.

## 4. Version Control

- **Git Managed**: Commit epics to the repository to inextricably link scope
  alongside code revisions.
