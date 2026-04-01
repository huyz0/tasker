# Coding Standards

This document outlines the strict coding standards and best practices for the project to ensure maintainability, scalability, and code quality. These rules must be adhered to or appropriately justified if bypassed.

## 1. File & Module Size Limits
- **Max Length**: A single file or module **MUST NOT exceed 300-400 lines of code**.
- **Reasoning**: Smaller files reduce cognitive load, enforce the Single Responsibility Principle, and make unit testing straightforward.
- **Action**: When a file approaches this limit, aggressively refactor by:
  - Extracting helper logic into separate utility functions.
  - Moving complex UI interactions into custom React hooks (Frontend).
  - Extracting domain services or specific command handlers (Backend).
- **Exceptions**: Large auto-generated files (e.g., from TypeSpec or ORM outputs) are exempt.

## 2. Cohesion & Feature Envy (Coupling)
- **Co-location**: Group related files intensely. Concepts that change together should live together.
- **Prevent Feature Envy**: Avoid designing modules that act primarily on the data of other modules. If Module A frequently calls methods on Module B just to manipulate B's data, the logic likely belongs in Module B. 
- **Frontend App**:
  - Keep React components co-located with their styles, local sub-components, `.test.tsx` (Vitest), and `.stories.tsx` (Storybook) in a dedicated folder (e.g., `components/MyWidget/`).
- **Backend App (DDD)**:
  - Organize logic by **Bounded Context** (e.g., `Organizations`, `Tasks`). Do not create monolithic `controllers/`, `services/`, `models/` folders. Instead, keep a feature’s models, handlers, and repositories encapsulated in its domain folder.

## 3. Unidirectional Dependency
- **Rule**: Dependencies must flow perfectly in one direction. Circular dependencies are strictly forbidden and will fail the build (enforced by tools like `madge` or ESLint).
- **Domain-Driven Design (Backend)**:
  - Dependencies must point inward toward the Domain layer.
  - **Infrastructure Layer** (Drizzle ORM, Connect-RPC, third-party APIs) depends on **Application Layer**.
  - **Application Layer** (CQRS Command/Query Handlers) depends on the **Domain Layer**.
  - **Domain Layer** (Entities, value objects, domain logic) depends on **nothing**. It has zero knowledge of the database or network.
- **CQRS Structure**:
  - The Write path (Commands) and the Read path (Queries) must not depend on each other. If a Command handler needs to perform a read, it queries the Domain repository, not the UI Read model.

## 4. Linting & Code Quality
- **Rule**: Fix linting errors rather than suppressing them.
- **Exceptions**: You may **ONLY** use inline suppressions like `// eslint-disable-next-line` or `// @ts-expect-error` if there is a highly specific, strong architectural reason that is explicitly documented in an adjacent comment explaining *why*. "I don't know how to fix it" is not an acceptable reason.
- **Adjusting Rules**: If a specific linter rule actively contradicts our architectural patterns across the entire codebase, *change the rule in the global configuration file* rather than suppressing it individually.
- **Strict TypeScript**: 
  - `any` is forbidden. Use `unknown` or strictly type the object. 
  - All runtime boundary data must be validated using **Zod** (or ArkType) before crossing into business logic.
- **Dead Code**: Ensure tools like `Knip` report absolute zero. Remove unused files, types, and dependencies immediately.
- **Agent Execution**: AI Agents acting as engineers or reviewers MUST physically execute linting, type-checking, and build commands (e.g., `npx moon check --all`) in a terminal to verify the code genuinely compiles before considering a task completely implemented or reviewed.

## 5. Technology-Specific Rules
- **State Management (Frontend)**: Local state (`useState`) for isolated interactions. **TanStack Query** for all server state. Avoid heavy Redux/Zustand unless orchestrating complex client-side workflows (e.g., React Flow interactions).
- **UI Architecture (Frontend)**: Follow standard **Shadcn** patterns for primitives, using Tailwind CSS utility classes heavily. Do not try to extract complex custom CSS unless strictly required.
- **Eventing (Backend)**: When a transactional action occurs in MySQL, any side-effect must happen asynchronously via emitting an event to **NATS**.

## 6. Boilerplate & Licensing
- **License Headers**: Do not include copyright or license header blocks (e.g., MIT, Apache notices) at the top of individual source files. These take up unnecessary vertical space and reduce readability. Licensing is managed at the repository level via the root `LICENSE` file.
