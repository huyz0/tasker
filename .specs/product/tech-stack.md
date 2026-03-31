# Tech Stack

> Note: For architectural decision records (ADRs), system context, NFRs, and structural intents (DDD, CQRS), please see [architecture.md](./architecture.md).

## Frontend
- **Build Tool**: Vite
- **Framework**: React with Server-Side Rendering (SSR)
- **UI Design System**: Shadcn (built on Radix UI)
- **Styling**: Tailwind CSS
- **Interactive Workflows**: React Flow
- **UI Documentation & Testing**: Storybook
- **State & Real-Time Sync**: TanStack Query (React Query)
- **Language**: TypeScript

## Backend
- **Runtime**: Bun
- **Language**: TypeScript
- **Protocol**: gRPC over HTTPS (via Connect-RPC for Streaming)
- **Messaging**: NATS for Scalable Pub/Sub
- **Authentication**: OAuth2.1 (Google Auth)

## CLI (Command Line Interface)
- **Architecture**: Dual-Surface (Human DX vs Agent DX)
- **Language**: Go (Golang) - chosen for fast startup, standalone static binaries, and cross-platform compatibility.
- **Framework**: Cobra & Viper (for command parsing, routing, and robust configuration management).
- **Human Interface (TUI)**: Charmbracelet ecosystem (Bubble Tea, Lip Gloss, Huh) strictly scoped for rich, interactive **human** terminal workflows.
- **Agent Interface**: Explicit machine-driven JSON paths (`--json`) and Server Mode via **Model Context Protocol (MCP)** (e.g., using `mark3labs/mcp-go`). Bypasses the TUI completely.
- **RPC / Protocol**: Connect-Go for seamless, highly performant gRPC/Connect communication with the Bun backend.
- **Distribution**: GoReleaser for automated multi-platform binary compilation and release.

## Database
- **Storage**: MySQL
- **Search & Analytics**: OpenSearch

## Other Tools & Interfacing
- **API Contract**: TypeSpec
- **CLI & Human Interfaces**: Real-time web GUI and a dedicated Command Line Interface (CLI) built in Go, providing fast, statically compiled binaries for operators and AI agents.
- **AI Agent Skills**: Dynamically loadable and packageable tools/scripts that agents can execute to interact with the system. They are designed to be frictionlessly installable and runnable on-the-fly using commands like `npx skills <skill-name>` or `npx skills`.
- **System Context Integration**: Model Context Protocol (MCP) Config
## Monorepo & Build System
- **Build System & Caching**: Moonrepo (fast polyglot task runner with aggressive local and CI caching).
- **Toolchain Manager**: Proto (ensures deterministic, automatically managed versions of Node.js, Bun, and Go across all developer and agent environments).

## Quality & Continuous Integration
### Static Analysis & Quality
- **ESLint**: With plugins for React, TypeScript, and Tailwind CSS.
- **Prettier**: Consistent formatting across the codebase.
- **Knip**: Detects unused files and dependencies (critical for AI context).
- **Typedoc**: Automated documentation from TypeScript.

### Testing Suite
- **Vitest**: Fast, Vite-native unit and integration testing.
- **Playwright**: E2E and visual regression testing (excellent for React Flow/Shadcn).
- **Storybook Test Runner**: Functional testing for UI components.
- **MSW (Mock Service Worker)**: API mocking for consistent testing.

### API & Data Contracts
- **Zod / ArkType**: Runtime validation to enforce TypeSpec contracts.
- **Drizzle ORM**: Type-safe MySQL migrations and database access for Bun.

### Continuous Quality & Security
- **Husky & lint-staged**: Git hooks for automated quality checks.
- **Trivy / Snyk**: Dependency vulnerability scanning.
- **Checkly / Monitoring**: Production uptime for gRPC over HTTPS.

### Design & CSS
- **Chromatic**: Automated visual regression and UI/UX designer review.
- **Stylelint**: Enforces Tailwind best practices and CSS quality.
