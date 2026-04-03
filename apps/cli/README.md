# Tasker: CLI Engine

This is the Command Line Interface for Tasker, enabling humans and autonomous agents to manage organizations, projects, and epics natively via the terminal.

## Getting Started

### Prerequisites
- *See the main workspace [README](../../README.md) for global `moonrepo` and toolchain (`proto`) installation instructions.*

### Development
Execute the main application binary locally:
```bash
go run main.go
```

### Build
Produce the standalone executable `tasker-cli`:
```bash
go build -o bin/tasker-cli main.go
```
*Note: Depending on your global orchestrator, you can also run `moon run cli:build`.*

### Architecture
- Operates primarily by securely parsing arguments and triggering gRPC/Connect calls against the Tasker `backend` via the `shared-contract`.
