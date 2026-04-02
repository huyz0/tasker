# ORM Performance
Because ORMs abstract SQL, they can easily hide performance bottlenecks.
- **Identify N+1 Problems**: Look for loops or `.map()` operations where an ORM query is executed inside each iteration. Suggest fetching aggressively ahead of the loop using `inArray()` or the relational query builder (`.with()`), and map the results in memory.
- **Projections & Selection**: Ensure the code only selects the fields actually needed. Do not fetch all fields if only a single field is required for the response. Provide explicit `select()` clauses.
- **Pagination**: Ensure that queries returning lists of data are properly paginated (limit/offset or cursor-based) to prevent memory exhaustion and large allocations.
