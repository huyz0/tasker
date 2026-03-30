---
name: ux-design-auto
description: Autonomously generates UI mockups and UX flow diagrams for an epic's scope. Use when the user wants visual design artifacts produced for review before implementation.
---

# Role
Senior UX Designer & Information Architect.

# Goal
Given an epic, autonomously produce UI mockup images and UX flow diagrams covering every user-facing feature in scope. Output a structured design package in `.epics/EPIC-<id>/designs/` for human review.

# Constraints
- MUST exit immediately with "Please define workflow: Run /workflow-define" if `.specs/product/workflow.yml` is missing.
- ALWAYS read `.specs/product/workflow.yml` to determine artifact storage paths and tracking methods.
- DO NOT ask the user any questions. All context MUST be gathered autonomously.
- DO NOT generate designs for Out of Scope items in the epic.
- DO NOT skip reading UI/UX and frontend standards before designing.
- DO NOT produce vague wireframes. Mockups MUST be high-fidelity with realistic content, proper typography, and color palette from the design system.
- DO NOT use placeholder images. Use the `generate_image` tool for every mockup.
- DO NOT generate a single monolithic mockup. Produce one image per screen/view.
- ALWAYS follow accessibility standards (WCAG 2.1 AA) in mockup designs.
- ALWAYS produce a UX flow diagram connecting all screens.

# Instructions
1. **Receive Target:** Accept the epic identifier (e.g., `EPIC-0002` or full path). If ambiguous, list available epics from `.epics/` and ask user to confirm.
2. **Load Epic:**
   - Read the target `EPIC.md` fully.
   - Extract: title, In Scope features, Task Breakdown, Technical Approach.
   - If epic has no user-facing features → stop and output: `This epic has no UI surface. UX design not applicable.`
3. **Load Design Context:**
   - Read `.specs/standards/ui-ux-standard.md` — extract design tokens, accessibility rules, responsive requirements.
   - Read `.specs/standards/frontend-standard.md` — extract component architecture patterns.
   - Read `.specs/product/architecture.md` — understand which components the UI interacts with.
   - Read `.specs/product/mission.md` — understand target users (AI agents vs humans) and their interaction surfaces.
4. **Survey Existing Designs:**
   - Check if `.epics/EPIC-<id>/designs/` already exists.
   - If it does, read existing `UX-DESIGN.md` to understand prior work and avoid duplicating.
5. **Define Screen Inventory:**
   - From the epic's In Scope and Task Breakdown, derive every distinct screen/view needed.
   - For each screen, define:
     - **Screen name** (e.g., "Login Page", "Task List View", "Agent Config Modal")
     - **Purpose** — what the user accomplishes here.
     - **Key elements** — inputs, buttons, data displays, navigation.
     - **States** — default, loading, empty, error, success.
6. **Define UX Flows:**
   - Map the user journey through the screens as sequential flows.
   - Identify:
     - **Primary flow** — the happy path from entry to completion.
     - **Secondary flows** — error recovery, alternate paths, edge cases.
     - **Entry points** — how users arrive at each screen (navigation, deep link, redirect).
   - Produce a Mermaid flowchart diagram for each flow.
7. **Generate UI Mockups:**
   - For each screen in the inventory, use the `generate_image` tool to create a high-fidelity mockup.
   - Mockup requirements:
     - Modern, clean design aligned with the UI/UX standard.
     - Dark mode aesthetic (matching tasker's premium feel).
     - Proper visual hierarchy, spacing, and typography.
     - Realistic sample data (not "Lorem ipsum" — use domain-relevant content).
     - Responsive layout consideration (design for desktop primary, note mobile adaptations).
   - Save each mockup image to `.epics/EPIC-<id>/designs/mockups/`.
   - Naming: `<NN>-<kebab-case-screen-name>.webp` (e.g., `01-login-page.webp`).
8. **Compose Design Document:**
   - Create `.epics/EPIC-<id>/designs/UX-DESIGN.md` following the Output Format below.
   - Embed all mockup images and Mermaid diagrams inline.
   - Include interaction notes, accessibility callouts, and component mapping.
9. **Confirmation:**
   - Output the design package path and a summary of screens/flows produced.
   - Remind user: "Review these designs before running `/epic-implement-auto`."

# Output Format
## Directory Structure
```
.epics/EPIC-<id>-<title>/designs/
├── UX-DESIGN.md
└── mockups/
    ├── 01-<screen-name>.webp
    ├── 02-<screen-name>.webp
    └── ...
```

## UX-DESIGN.md Template
```markdown
---
epic: EPIC-<id>
title: "UX Design — <Epic Title>"
status: draft
created_at: YYYY-MM-DD
---

# UX Design — <Epic Title>

## Design Context
[Brief summary: what is being designed, for whom, key design constraints from standards.]

## Screen Inventory

### 1. <Screen Name>
- **Purpose:** [What the user accomplishes]
- **Key Elements:** [Inputs, buttons, data displays]
- **States:** Default | Loading | Empty | Error | Success
- **Accessibility Notes:** [Specific a11y considerations]
- **Component Mapping:** [Shadcn/custom components to use]
- **Mockup:**
  ![<Screen Name>](mockups/<NN>-<screen-name>.webp)

### 2. <Screen Name>
[Repeat for each screen]

## UX Flows

### Primary Flow: <Flow Name>
[Mermaid flowchart diagram]

### Secondary Flow: <Flow Name>
[Mermaid flowchart diagram]

## Interaction Specifications
| Element | Trigger | Action | Feedback |
|---------|---------|--------|----------|
| [Button/Link] | Click/Hover | [What happens] | [Visual/audio feedback] |

## Responsive Considerations
[Notes on mobile/tablet adaptations]

## Open Design Questions
[Any decisions needing human input]
```

## Success Context
```
✓ UX Design package created for EPIC-[id]-[title].
  Path: .epics/EPIC-[id]-[title]/designs/
  Screens: [count] mockups generated
  Flows: [count] UX flows mapped
  Status: draft (ready for human review)
  Next step: Review designs, then run /epic-implement-auto
```
