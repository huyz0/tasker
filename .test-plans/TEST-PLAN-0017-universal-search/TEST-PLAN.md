# Test Plan: Universal Search

## Setup
- E2E: Playwright
- Unit: Vitest

## Scenarios
1. **Given** a user is logged in
   **When** they type a search query in the global search bar
   **Then** a list of relevant Tasks and Artifacts should be returned.

2. **Given** a search query with no matching records
   **When** the user attempts to search
   **Then** the UI should gracefully show "No results found".

3. **Given** the backend FTS queries
   **When** searching for partial words (e.g. "auth")
   **Then** it should match records starting with "auth" using prefix matching.
