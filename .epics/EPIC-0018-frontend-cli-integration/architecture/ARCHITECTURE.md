# EPIC-0018: Frontend and CLI Integration Architecture

## 1. Overview
The goal of this initiative is to eliminate all remaining hardcoded mocks in the React GUI and Go CLI, ensuring that all frontend interfaces bind to the real `Connect-RPC` APIs built in previous epics. The architecture of the backend remains entirely unchanged.

## 2. Dynamic Context & State Management
Currently, components like `ArtifactBrowser` and `ProjectsDashboard` rely on hardcoded variables (e.g., `MOCK_ORG_ID`, `MOCK_PROJECT_ID`).
- **Solution:** A new layout context or Zustand slice (`GlobalContextStore`) will be introduced to track the `activeOrgId` and `activeProjectId`.
- All `useQuery` hooks will reference these global identifiers to fetch context-aware data.

## 3. Data Fetching
- **React GUI:** Will utilize `@tanstack/react-query` to consume the Connect-RPC generated TypeScript clients.
- **Go CLI:** Will instantiate `connect-go` clients to interact with the backend over HTTP/2. The CLI will discard hardcoded stdout strings.

## 4. Security Considerations
- The frontend will continue to use the existing HTTP-only session cookies established in EPIC-0009. No new authentication architecture is required.
