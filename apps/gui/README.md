# Tasker: Web GUI

This is the central web interface for the Tasker Agent Management System, built with **React**, **Vite**, and **Tailwind CSS**.

## Getting Started

### Prerequisites
- *See the main workspace [README](../../README.md) for global `moonrepo` and toolchain (`proto`) installation instructions.*

### Development
Start the local Vite development server:
```bash
bun run dev
```

### Visual Testing (Storybook)
This project enforces rigorous visual layout documentation. To launch the isolated component playground with Tailwind CSS natively injected:
```bash
bun run storybook
```

### Testing
Run the Vitest test suite (with `jsdom` configuration):
```bash
bun run test
```

### Build
Generate the production-ready static output into `/dist`:
```bash
bun run build
```

## Architecture
- **State Management**: React Query for async server states; Zustand for global layout UI state.
- **Styling**: Tailwind CSS utilizing HSL Semantic tokens for explicit dark/light mode toggles.
- **Components**: Adheres to a strict domain-driven container/presentational split with `lucide-react` icons.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth consumer ID used by the "Connect GitHub via OAuth" button on the repository link form. |
| `VITE_BITBUCKET_CLIENT_ID` | Bitbucket OAuth consumer ID used by the "Connect Bitbucket via OAuth" button. Not needed for the direct-API-token Bitbucket linking option, which posts credentials straight to the backend. |
