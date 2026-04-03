# Tasker: Backend Core Services

This is the primary Tasker API server, built on top of **Bun.js** for high performance and strict TypeScript enforcement. It powers the autonomous AI agents structure, artifacts metadata, and task-state transitions.

## Getting Started

### Prerequisites
- *See the main workspace [README](../../README.md) for global `moonrepo` and toolchain (`proto`) installation instructions.*

### Development
Start the local server with hot reload:
```bash
bun run dev
```
*(By default, this command maps to running `index.ts` through Bun's internal fast execution)*

### Production Run
```bash
bun run index.ts
```

## Architecture
- **Contracts**: This backend implements the explicit contracts maintained in the `packages/shared-contract` TypeSpec schemas.
- **Protocol**: Exposes services via the `ConnectRPC` protocol, ensuring safe, strongly typed interactions with both the GUI frontend and the Go CLI.
