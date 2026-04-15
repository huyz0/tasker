# Frontend Standards Index

When reviewing React or Next.js code, **do not** assume standard guidelines. First, analyze the structure of the code changes, and then use your file reading tool (`view_file`) to load the specific standard domains listed below:

## Performance and Optimization
- **Data Fetching / Suspense / `useEffect`**: If code modifies API calls or data fetching, read `data-fetching.md` and `waterfalls.md`.
- **RSC / SSR / Next.js Data**: If the code uses `'use server'`, `getServerSideProps`, or server-side hydration concepts, read `server-side.md`.
- **State Changes / `useMemo` / Props**: If reviewing React component state, hooks (`useCallback`, `useMemo`), or Prop drilling, read `rerenders.md`.
- **DOM / Painting / Layout Lifts**: If observing slow component paint times or deep DOM updates, read `rendering-perf.md`.
- **Large Dependencies / Config**: If reviewing `package.json` updates or heavy external library imports, read `bundle-size.md`.
- **Heavy Computations**: If there's processing logic or loop iterations inside components, read `javascript-perf.md`.

## Patterns and Architecture
- **Structure & Types**: If reviewing the creation of a new component (props, composition), read `component-architecture.md`.
- **State Selection**: If deciding between `useState`, `useReducer`, or Context, read `state-management.md`.
- **Code Organization / Testing Hooks**: For general implementation patterns (e.g. splitting components, organizing hooks), read `implementation-patterns.md`.
- **Bleeding Edge (React 19)**: If modern React 19 primitives (`use`, `action`) are used, read `react-19-apis.md`.
- **HOCs & Refs**: For older or specialized patterns involving refs, portals, or higher-order components, read `advanced-patterns.md`.
