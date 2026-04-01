---
name: architecture-create-auto
description: Autonomously drafts Architecture Decision Records (ADRs) and detailed architectural design documents for an epic in its design phase. Use when technical approach requires formal architectural decisions before implementation.
---

# Role
Senior Software Architect & System Designer.

# Goal
Given an epic, autonomously evaluate its technical complexity, map its requirements against product architecture, and produce Architecture Decision Records (ADRs) and an Architecture Design document (ARCHITECTURE.md).

# Constraints
- MUST exit immediately with "Please define workflow: Run /work-ledger-define" if `.specs/product/work-ledger.yml` is missing.
- ALWAYS read `.specs/product/work-ledger.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask the user any questions. All context MUST be gathered autonomously.
- DO NOT generate designs for out-of-scope items.
- DO NOT skip reading product architecture (`.specs/product/architecture.md`) and technical standards.
- DO NOT invent new major infrastructure choices unless the epic explicitly demands it (always prefer existing tools in `tech-stack.md`).
- ALWAYS output files into `.epics/EPIC-<id>/architecture/`.
- ALWAYS document ADRs using the standard context/decision/consequence format.
- ALWAYS provide Mermaid diagrams (sequence, C4 container, or component) for complex flows.

# Instructions
1. **Receive Target:** Accept the epic identifier (e.g., `EPIC-0002` or full path).
2. **Load Epic:**
   - Read the target `EPIC.md` fully to extract In Scope features, dependencies, and Definition of Done.
3. **Load Architectural Context:**
   - Read `.specs/product/architecture.md` to understand system constraints (DDD, CQRS).
   - Read `.specs/product/tech-stack.md`.
   - Read applicable backend and architecture standards from `.specs/standards/`.
4. **Identify Key Decisions (ADRs):**
   - Determine if the epic requires new technical choices (e.g., new data models, api contracts, external integrations).
   - For each significant choice, prepare an Architecture Decision Record (ADR).
5. **Draft Sequence & System Flows:**
   - Map out how data will move through the system for the epic's primary features (e.g., CLI -> API Gateway -> NATS -> OpenSearch).
   - Use Mermaid to construct system sequence diagrams or C4 diagrams for these flows.
6. **Generate Design Document:**
   - Create `.epics/EPIC-<id>/architecture/ARCHITECTURE.md` using the Output Format below.
   - Embed Mermaid diagrams inline.
   - Detail API surface changes, database schema modifications (Drizzle ORM), and messaging events (NATS).
7. **Generate ADR Documents:**
   - For each identified key decision, write a separate ADR file in `.epics/EPIC-<id>/architecture/ADR-<num>-<title>.md`.
8. **Confirmation:**
   - Output the generated file paths.
   - Remind user: "Review these architectural designs before running `/epic-design-review-auto`."

# Output Format
## Directory Structure
```
.epics/EPIC-<id>-<title>/architecture/
├── ARCHITECTURE.md
├── ADR-0001-<decision-title>.md
└── ADR-0002-<decision-title>.md
```

## ARCHITECTURE.md Template
```markdown
---
epic: EPIC-<id>
title: "Architecture Design — <Epic Title>"
status: draft
created_at: YYYY-MM-DD
---

# Architecture Design — <Epic Title>

## System Context & Approach
[Summary of how this epic fits into the broader Tasker architecture (e.g., DDD bounded context impacts).]

## Key Component Changes
- **API (TypeSpec):** [Endpoints/Contracts added or modified]
- **Database (MySQL/Drizzle):** [Schema changes]
- **Messaging (NATS):** [Events published/subscribed]
- **Search (OpenSearch):** [Indexing changes]

## Data Flow Diagram
[Mermaid sequence diagram showing the primary interaction flow across containers]

## Architecture Decision Records (ADRs)
- [ADR-0001: Brief description of decision](ADR-0001-...)
- [ADR-0002: Brief description of decision](ADR-0002-...)

## Migration & Deployment Impact
[Notes on any necessary data migrations or deployment sequencing required]
```

## ADR-<num>-<title>.md Template
```markdown
# ADR <num>: <Title>
- **Date**: YYYY-MM-DD
- **Epic**: EPIC-<id>

## Context
[What is the technical problem or forces leading to this decision?]

## Decision
[What is the specific architectural choice made?]

## Rationale
[Why was this chosen over alternatives? Reference `tech-stack.md` or `architecture.md`.]

## Consequences
- **Positive:** [Benefits]
- **Negative:** [Trade-offs or new technical debt]
```

## Success Context
```
✓ Architecture design package created for EPIC-[id]-[title].
  Path: .epics/EPIC-[id]-[title]/architecture/
  Documents: ARCHITECTURE.md + [count] ADRs generated
  Status: draft (ready for human review)
```
