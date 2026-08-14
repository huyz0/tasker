# Architecture: Universal Search

## High-Level Approach
We will expose a new `UniversalSearch` Connect-RPC method.
The backend will use `bun:sqlite` with the `fts5` extension for fast full-text search without requiring OpenSearch locally. We will query the full text search indices for both `artifacts` and `tasks`.

## Sequence Diagram
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend (Connect-RPC)
    participant SQLite (FTS5)

    User->>Frontend: Cmd+K / Type in Search Bar
    Frontend->>Backend (Connect-RPC): UniversalSearch({ query: "keyword" })
    Backend (Connect-RPC)->>SQLite (FTS5): MATCH 'keyword*'
    SQLite (FTS5)-->>Backend (Connect-RPC): results (tasks, artifacts)
    Backend (Connect-RPC)-->>Frontend: SearchResponse
    Frontend-->>User: Display results
```
