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
