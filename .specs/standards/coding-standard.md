# Coding Standards

## 1. File Size Limits

- **Max Length**: File MUST NOT exceed 400 lines. Exceptions: Auto-generated
  code.
- **Refactoring**: Actively extract helpers, hooks, domain services, or
  handlers.

## 2. Cohesion & Coupling

- **Co-location**: Group related files intensely (concepts that change together
  live together).
- **Prevent Feature Envy**: Logic belongs in the module that owns the targeted
  data.
- **Frontend**: Co-locate React component, styles, `.test.tsx`, and
  `.stories.tsx` in feature folders.
- **Backend (DDD)**: Group by Bounded Context (`/Organizations/`). Avoid
  monolithic `controllers/` or `services/` structure.

## 3. Unidirectional Dependency

- **Rule**: Dependencies flow inward. Circular dependencies strictly forbidden.
- **Backend Layers**: Infra -> App -> Domain -> Nothing.
- **CQRS**: Commands and Queries MUST NOT depend on each other.

## 4. Code Quality

- **Fix Errors**: Fix lint errors. Use inline disable annotations ONLY with
  documented architectural justification.
- **Strict TS**: `any` is forbidden. Use `unknown` or explicit types.
- **Validation**: Validate ALL runtime boundary payloads with Zod before
  executing business logic.
- **Dead Code**: Ensure zero unused files/exports (Knip).
- **Agent Rule**: AI Agents MUST physically run `npx moon check --all` in
  terminal to verify compilation before task completion.

## 5. Technology-Specific rules

- **Frontend State**: `useState` for local UI. TanStack Query for server data.
  Zustand strictly for complex cross-tree client state.
- **Frontend UI**: Use Shadcn + Tailwind. Avoid custom CSS.
- **Backend Events**: Async side-effects trigger via NATS events
  post-transaction.

## 6. Licensing Boilerplate

- **No Headers**: Do NOT include file-level copyright/license blocks. Rely on
  the root `LICENSE`.
