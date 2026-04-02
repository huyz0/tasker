# Type Safety
TypeScript's role is to ensure that the data flowing out of the database matches what your application expects.
- **Avoid `any` and `as` assertions**: `any` bypasses type checking entirely. If a query result shape is dynamic or complex, use `unknown` combined with a type guard.
- **Strict Null Checks**: Ensure that nullable database columns are correctly handled in TypeScript (e.g., optional chaining and type narrowing). Do not bypass null warnings with `!`.
- **Inferred ORM Types**: Do not manually duplicate types that Drizzle defines. Use Drizzle's `InferSelectModel` and `InferInsertModel` properties.
