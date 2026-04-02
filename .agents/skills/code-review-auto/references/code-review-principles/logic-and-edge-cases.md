# Agentic Logic Review Principles

## Goal
Verify execution logic, algorithmic correctness, and edge-case handling.

## Directives
- **Behavioral Focus:** Logic changes are the primary trigger for a deeper review. Focus heavily on behavioral changes proposed in the diff.
- **Edge Cases:** Actively look for off-by-one errors, null pointer dereferences, missing fallbacks, unhandled Promise rejections, and inverted conditionals.
- **Simplest Version:** Determine if the proposed implementation is the simplest version that fulfills the requirement. If it is over-engineered or overly complex, suggest a simplification and explain why.
- **Context Boundaries:** Ground suggestions in the visible scope. Acknowledge module boundaries; do not blindly question code defined in dependencies or external boundaries without strong cause.
