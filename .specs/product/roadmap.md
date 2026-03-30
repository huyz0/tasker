# Product Roadmap

## Phase 1: MVP

- Setup core API, CLI tools, agent skills, and real-time GUI.
- Manage organizations/users (admin & non-admin roles), teams, and approaches for seed admin/user setup.
- Authentication: Login with Google and invite users by email.
- Manage hierarchical organization structure.
- Manage task types (including hierarchy), task status enums, and state machines.
- Manage project templates, featuring a root task type.
- Manage projects derived from templates, including owner assignments.
- Manage agent roles and role configurations (e.g., system prompts, skills, MCP config).
- Manage instances of agents.
- Manage tasks belonging to projects (task type, human-readable ID derived from project ID, title, name, status, description, comments, labels).
- Manage relationships between tasks, agents, and humans (created by, assigned to, reviewers).
- Manage artifacts (text files, images, name, descriptions, labels) organized in nested folders.
- Manage task-to-artifact links.
- Task comments and Task AI text notes (specific note-taking capabilities for AI).
- Full Markdown formatting support for text artifacts, task descriptions, and comments.
- Artifact commenting system.
- Implement list, search, sort, filter, and paging capabilities for all core entities.

## Phase 2: Post-Launch (Non-MVP)

- Manage repositories (GitHub, Bitbucket Cloud) with read-only access to tasks and PRs, including link and auth setup.
- Manage project-to-repository relationship links.
- Display tasks linked to corresponding PRs and track builds/deployments on the repository level.
- Universal/Global search functionality across all artifacts and tasks.
