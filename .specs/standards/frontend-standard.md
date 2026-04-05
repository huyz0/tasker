# Frontend Specific Standards

## 1. Application Architecture (React/Next.js/Vite)

- **Container / Presentational**: Separate components fetching data/state
  ("Container") from UI-focused ones ("Presentational").
- **Directory Structure**: Co-locate domain components with feature hooks/API
  calls (`features/Tasks/`). Place generic UI primitives in `components/ui/`.
- **Composition over Booleans**: Prefer `<Select.Trigger>` and explicit variants
  (`<Button variant="destructive">`) instead of excessive boolean props for UI
  customization.
- **Storybook**: MANDATORY. All newly created or modified UI components, primitives, and screens MUST have a corresponding `.stories.tsx` file generated or updated. Document all visual states (Empty, Loading, Error, Populated). Launch the visual playground locally by running `npm run storybook` from within `apps/gui`.

## 2. State Management Rules

- **Rule of Locality**: Keep state as close to its consumer as possible.
- **Local State**: Exclusively for transient UI (`useState`/`useReducer`).
- **Server State**: Mendatory use of **TanStack Query** (or Apollo/SWR). DO NOT
  manage network data manually with `useEffect`.
- **Global Client State**: Use lightweight libraries (`Zustand`) ONLY for
  coordinating cross-tree UI state (e.g., dark mode, wizards).

## 3. Type Safety & Validation

- **Strict Props**: Explicit TypeScript interfaces required on components. NO
  `any` or ambiguous `Record<string, unknown>`.
- **Boundary Validation**: Zod-validate all `fetch()` JSON payloads instantly
  upon resolution.
- **Forms**: Validate via schemas (Zod) and React Hook Form.

## 4. Performance & Optimization

- **Eliminate Waterfalls**: Stream data aggressively via React `<Suspense>`
  boundaries. Avoid sequential data fetching.
- **Bundle Size**: Avoid wildcard `index.ts` barrel files. Import components
  from explicit source paths to maximize tree-shaking.
- **Native Animations**: Use `document.startViewTransition` / React
  `<ViewTransition>` over heavy JS animation libraries (e.g., Framer Motion).
- **Dynamic Imports**: Use `next/dynamic` or `React.lazy` on expensive
  routes/sub-trees.
- **Memoization (`useMemo` / `useCallback`)**: Only use when profiling dictates
  or to stabilize hook dependencies. Premature optimization forbidden.
- **Render Opt-Out**: Favor `children` composition over `React.memo` to bypass
  renders.

## 5. Hook Design

- **Single Responsibility**: One task per custom hook.
- **React 19 Readiness**: Skip `forwardRef`. Prefer `use()` instead of
  `useContext()`.
- **Cleanups**: `useEffect` subscriptions MUST return deterministic teardowns to
  prevent strict-mode memory leaks.
