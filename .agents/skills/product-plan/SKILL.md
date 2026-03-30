---
name: product-plan
description: Creates foundational product docs (mission, roadmap, architecture, tech-stack) in .specs/product/. Use when starting a new product or establishing product documentation.
---

# Role
Product Strategist & Technical Planner.

# Goal
Establish foundational product documentation via interactive conversation. Creates `mission.md`, `roadmap.md`, `architecture.md`, and `tech-stack.md` in `.specs/product/`.

# Constraints
- ALWAYS use `AskUserQuestion` tool for inquiries.
- DO NOT ask multiple questions at once. One question per step.
- DO NOT over-document. Capture enough to start; refine later.
- If user provides brief answers, accept them — docs can be expanded later.
- If user skips a section, create the file with placeholder: "To be defined".

# Instructions

## Step 1: Check Existing Docs
Check `.specs/product/` for: `mission.md`, `roadmap.md`, `architecture.md`, `tech-stack.md`.

If any exist → ask user: (1) Start fresh, (2) Update specific files, (3) Cancel.
- Option 2 → ask which files, gather info only for those.
- Option 3 → stop.

If none exist → proceed.

## Step 2: Product Vision (→ mission.md)
Ask sequentially (wait between each):
1. "What problem does this product solve?"
2. "Who is this product for?"
3. "What makes your solution unique?"

## Step 3: Roadmap (→ roadmap.md)
Ask sequentially:
1. "What are the must-have features for launch (MVP)?"
2. "What features are planned post-launch?" (accept "none yet")

## Step 4: Tech Stack (→ tech-stack.md)
Check if `.specs/standards/global/tech-stack.md` exists.
- If exists → summarize and ask: (1) Same as standard, (2) Different.
- If missing or "Different" → ask: Frontend, Backend, Database, Other.

## Step 5: Architecture (→ architecture.md)
Ask sequentially:
1. "What are the main architectural patterns and deployment targets?"
2. "What are the key Non-Functional Requirements (NFRs)?"

## Step 6: Generate Files
Create `.specs/product/` if needed. Generate all four files.

## Step 7: Confirmation
```
✓ Product documentation created:
  .specs/product/mission.md
  .specs/product/roadmap.md
  .specs/product/tech-stack.md
  .specs/product/architecture.md
```

# Output Format

## mission.md
```markdown
# Product Mission
## Problem
[From Step 2]
## Target Users
[From Step 2]
## Solution
[From Step 2]
```

## roadmap.md
```markdown
# Product Roadmap
## Phase 1: MVP
[From Step 3]
## Phase 2: Post-Launch
[From Step 3 or "To be determined"]
```

## tech-stack.md
```markdown
# Tech Stack
> Note: For architectural guidelines, see `architecture.md`.
## Frontend
[Tech or "N/A"]
## Backend
[Tech or "N/A"]
## Database
[Tech or "N/A"]
## Other
[Tools, hosting, services]
```

## architecture.md
```markdown
# Architecture & Principles
## System Context & Component View
[Overview from Step 5]
## Patterns & Intents
[Explicit patterns from Step 5]
## Deployment
[Infrastructure intent from Step 5]
## Non-Functional Requirements (NFRs)
[Constraints from Step 5]
```

# Integration
`/spec-shape` reads these files when planning features.
