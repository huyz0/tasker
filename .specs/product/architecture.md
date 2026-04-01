# Architecture & Principles

## System Context
Tasker operates as the foundational **Task Management System for AI Agents and Humans**.
- **Internal Entities**: Designed to scale for up to 20K AI Agents, 20K Human Users, 20K Teams, and 2K Concurrent Projects.
- **External Integrations**:
  - *Identity/Auth*: Google Auth (OAuth2.1) for humans; Machine-to-Machine (M2M) API tokens tailored for Agents.
  - *AI Execution Platforms*: Interfaces with external autonomous agent runtimes via standardized API contracts (TypeSpec).
  - *Monitoring & Observability*: OpenTelemetry (OTel) for distributed tracing, metrics, and structured logging. In production environments, it is configured via standard environment variables (OTLP) to seamlessly export to well-known observability platforms like Datadog, Prometheus, Grafana Tempo, or Jaeger. In standalone/portable local deployments, it gracefully falls back to no-op or stdout reporting to prevent unreachable dependency errors.

## Component Design (Container View)

- **Frontend (Web App)**: React SPA served with Server-Side Rendering (SSR) where necessary. Designed primarily for humans to interact, monitor, and provide feedback to agents in real-time.
- **CLI & AI Agent Skills**: A suite of command-line tools and executable agent skills that interface directly with the API Gateway. These afford AI agents and advanced users scriptable, fast access to the system.
- **API Gateway & Core Logic (Backend)**: Bun + gRPC. High-performance, low-latency command routing. Provides bi-directional streaming for fast synchronization with Agent systems.
- **Event Bus**: NATS. The central nervous system of the architecture decoupling side-effects from primary logic, capable of scaling to 40K+ concurrent pub/sub connections.
- **Primary Data Store**: MySQL. The source of truth for transactional states.
- **Search & Analytics**: OpenSearch. Handles heavy reading and complex filtering (e.g., retrieving failed task logs across multiple teams) without impacting MySQL performance.
- **Data Storage Abstraction**: The backend provides flexible interfaces for both the transactional database and search layers. This abstraction allows seamless switching between enterprise clustered components (MySQL/OpenSearch) and `bun:sqlite` with the FTS5 extension, empowering standalone, zero-config local execution without losing full-text search capability.

## Architectural Patterns & Intents

### Domain-Driven Design (DDD)
The codebase, specifically the backend, is separated into strict **Bounded Contexts** (e.g., `Organizations/Teams`, `Projects`, `Tasks`, `Artifacts`, `Feedback`).
- **Intent**: By restricting modules to their own domain boundaries, agents operate within clear boundaries, avoiding cross-domain entanglement. When states change in one domain (e.g., a Task concludes), it publishes a Domain Event via NATS, allowing other domains to react independently.

### Command-Query Responsibility Segregation (CQRS)
Because AI agents generate extreme volumes of write activity compared to human reads, the architecture splits processing asymmetrically:
- **Write Path (Commands)**: Incoming state changes from Agents/Humans are synchronous. They are handled by Bun, validated using Zod, and committed transactionally to MySQL. Upon database commit, an event is emitted to NATS.
- **Read Path (Queries)**: To prevent blocking the main transactional database, UI and Agent search queries generally read from **OpenSearch**. NATS events continually sync MySQL state into OpenSearch materialized views.
- **Intent**: Ensure that a spike in Agents aggressively updating task logs will never degrade the dashboard query performance for human managers.

### Modular Monolith (Moving to Microservices)
- **Intent**: The application is structured logically as independent feature modules within a single monorepo deployable. This provides speed and simplicity during the initial development phases. As the system scales toward 20K users/agents, specific high-load bound contexts can be trivially extracted independently.

### CLI: Dual-Surface Architecture (Agent DX vs Human DX)
Because AI agents and humans interact fundamentally differently, the CLI must provide a **Dual-Surface Interface** from the same binary.
- **Human DX (Discoverability)**: Optimizes for interactive terminals, rich colors, bespoke flags (`--title "My Doc"`), and step-by-step wizards.
- **Agent DX (Predictability)**: Optimizes for zero-trust, deterministic Machine-to-Machine communication.
  - **Raw JSON Payloads**: Agents invoke commands via `--json` mapped strictly to the API schema, neutralizing hallucinated nested flags.
  - **Schema Introspection**: The CLI acts as its own documentation. Agents can run `cli schema [cmd]` to introspect exactly what is accepted at runtime without costing token limits.
  - **Context Window Discipline**: Support for strict field masks (`--fields`) and NDJSON pagination (`--page-all`) ensures AI agents do not blow their LLM context window limits reading large data dumps.
  - **Input Hardening against Hallucinations**: Zero-trust defense-in-depth on agent inputs enforcing strict sanitization specifically against adversarial edge-cases (e.g., double-url-encoding, rejected path traversals `../../.ssh`, hallucinated query parameters embedded in resource IDs).
  - **Safety Rails (Dry-Run)**: Support for a `--dry-run` flag is strictly enforced, allowing agents to safely validate mutation requests before committing actual actions.
  - **Multi-Surface Accessibility**: Rather than just `stdio`, the CLI is simultaneously exposed via the **Model Context Protocol (MCP)** using JSON-RPC, or as a plugin/extension.

## Deployment View
- **Packaging & Portability**: The architecture leverages `bun build --compile` natively with `bun:sqlite` to package the frontend and backend into a single, highly portable, easy-to-run executable with zero external database dependencies. In this standalone mode, frontend-to-backend network overhead is eliminated; communication is routed via lightweight, in-process function calls that still rigorously align with the defined Connect-RPC API contracts.
- **Infrastructure**: Cloud-native, relying on containerized application deployments (e.g., Docker + Kubernetes, or AWS ECS/GCP Cloud Run).
- **Backend Nodes**: Bun Backend containers run immutably and scale horizontally behind a load balancer to accommodate streaming (Connect-RPC) requests.
- **Data Layers**: Managed MySQL with Read Replicas and point-in-time recovery. Managed OpenSearch cluster.
- **Messaging Node**: NATS deployed as a resilient, multi-node clustered service ensuring high availability.
- **Edge Delivery**: Frontend built via Vite and distributed globally through a CDN for minimal latency.

## Non-Functional Requirements (NFRs)

- **Scalability**: NATS pub/sub and Bun instances are designed to scale horizontally to effortlessly handle up to 40K concurrent connections. Database partitioning by Bounded Context is considered for future horizontal scale.
- **Performance**: High throughput per second (TPS) achieved. Use of gRPC, Connect-RPC, and strict Zod runtime validation ensures typical agent operations remain extremely low latency (P95 < 50ms).
- **Reliability**: Asynchronous event-driven fallbacks. If OpenSearch indexing drops, writes can still be safely processed in MySQL, providing graceful degradation.
- **Security**: OAuth2.1 for human SSO. Strict API limits and quotas applied to specific AI Agent keys. Multi-tenant row-level access controls implemented via Drizzle ORM.
- **Developer Speed**: Full end-to-end type safety from database (Drizzle) to runtime (Bun/Zod) to client (React Query/TypeSpec). Monorepo execution via fast tools like Vite and Bun.
