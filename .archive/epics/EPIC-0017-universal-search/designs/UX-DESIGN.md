# UX Design: Universal Search

## Key Screens
1. **Global Navigation Bar / Command Palette**:
   - A search input globally accessible (e.g., via Cmd+K).
   - Dropdown or modal listing results grouped by Tasks and Artifacts.
   - Highlighting matched keywords.
   - Distinct icons for Tasks vs Artifacts.

## User Flow
```mermaid
flowchart TD
    A[User opens Tasker] --> B{Presses Cmd+K?}
    B -- Yes --> C[Command Palette Opens]
    B -- No --> D[Clicks Search Input in Header]
    D --> C
    C --> E[Types query]
    E --> F[Debounced API call]
    F --> G[Results Rendered in List]
    G --> H[User clicks result]
    H --> I[Navigate to entity detail view]
```
