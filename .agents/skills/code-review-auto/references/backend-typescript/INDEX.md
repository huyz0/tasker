# Backend TypeScript Standards Index

When reviewing Backend TypeScript code (Node.js, Bun, API routes, ORM), analyze the code changes and use `view_file` to load the specific standard domains listed below:

## Security & Validation
- **Input Validation / Zod**: If code handles incoming requests or user input, read `backend-typescript/validation.md`.
- **Security & Vulnerabilities**: If reviewing raw queries, auth, or permission bounds, read `backend-typescript/security.md`.

## Data Access & ORM (Drizzle)
- **Performance & N+1 Problems**: If reviewing complex database queries, loops, or relations, read `backend-typescript/orm-performance.md`.
- **Transactions & Operations**: If reviewing mutation logic or batch inserts, read `backend-typescript/transactions.md`.

## Architecture & Type Safety
- **Type Constraints & Nullability**: If reviewing entity models, types, or complex generics, read `backend-typescript/type-safety.md`.
- **Repository Pattern & DTOs**: If reviewing service layer logic and data boundaries, read `backend-typescript/architecture.md`.
