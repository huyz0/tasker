# Security
- **SQL Injection**: While ORMs (Drizzle) are secure by default, watch out for "raw query" functions or fragments. Ensure no string concatenation is used when building SQL dynamically—always use parameterized queries or the ORM's native placeholder bindings.
- **Least Privilege**: Ensure the database connection handles execution securely. Permissions check for data updates/deletions must exist on the backend.
- **Data Leaks**: Avoid returning raw database entities directly to API consumers. Map database entities to specific response DTOs to prevent sensitive internal fields (e.g., `passwordHash`, `internalNotes`) from leaking to the frontend.
