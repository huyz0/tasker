# Validation
- **Input Validation**: Never trust data directly from external sources or ORM queries if it came from user input. Use validation libraries (like **Zod**) to parse and validate the shape of data *before* it enters the business logic layer, especially when inserting or updating records.
- **DTOs vs Domain Types**: Define clear Zod schemas for incoming requests. Distinguish between internal database models and validation DTOs.
