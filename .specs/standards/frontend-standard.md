# Frontend Specific Standards

This document establishes architectural and best-practice standards exclusively for frontend development in the project, ensuring high-performance, maintainable, and type-safe client-side applications.

## 1. Application Architecture (React/Next.js/Vite)
- **Container / Presentational Pattern**: Separate components that fetch data or manage complex state ("Containers" or "Smart" components) from purely UI-focused components ("Presentational" or "Dumb" components).
- **Directory Structure**: 
  - Keep domain-specific components alongside their business logic (e.g., hooks, API calls) in feature-based folders (e.g., `features/Tasks/`).
  - Keep generic, reusable UI elements in a shared folder (e.g., `components/ui/`).
- **Storybook / Component Showcases**: All reusable, isolated UI primitives or major complex visual units must be documented within Storybook (or similar showcase tool) alongside their test files to prove isolation.

## 2. State Management Rules
- **Rule of Locality**: The most important rule of state is to keep it as close to where it is needed as possible. Do not lift state to a global store unnecessarily.
- **Local State (`useState` / `useReducer`)**: Exclusively for transient UI states (e.g., an "is open" boolean for an accordion, text input value).
- **Server State / Data Fetching**: Mandatory use of **TanStack Query** (or Apollo, SWR if explicitly configured) for any data requested from the network. Never manage loading/error/data states manually using `useEffect` for network calls.
- **Global Client State**: Use lightweight libraries like **Zustand** only for coordinating state across disparate sub-trees (e.g., a "dark mode" toggle, multi-step complicated wizard flow data).

## 3. Type Safety & Validation
- **Strict Props**: Every React component must define heavily explicit TypeScript interfaces. Do not use `any` or ambiguous typing like `Record<string, unknown>` when the shape is known.
- **Boundary Validation**: Data coming from the backend via API calls must be passed through a **Zod schema validation** immediately upon resolving. Do not implicitly trust the backend structure. 
- **Forms**: Form state validation logic should be managed via schemas (Zod) and tools like React Hook Form.

## 4. Performance & Optimization
- **Memoization (`useMemo` / `useCallback`)**: Must be considered *only* when profiling proves a bottleneck or when passing objects/functions as dependencies to other hooks (`useEffect`, or memoized child components). Premature optimization is forbidden.
- **Bundle Splitting**: Routes and exceptionally large or rarely used libraries must be dynamically imported/code-split using `React.lazy` or equivalent routing mechanisms to maintain small initial load times.
- **Render Opt-Out**: Rely exclusively on component composition (e.g., passing `{children}`) to prevent unnecessary renders, before resorting to `React.memo`.

## 5. Hook Design
- **Single Responsibility**: Custom hooks should do one specific thing. If a hook handles fetching data *and* complex scroll logic, split it.
- **Cleanups**: Any subscription, timeout, interval, or event listener created inside a `useEffect` must return a deterministic cleanup function to prevent memory leaks and strict-mode double-firing bugs.
