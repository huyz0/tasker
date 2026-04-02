# Agentic Performance Review Principles

## Goal
Ensure the codebase remains performant under 10x-100x load.

## Directives
- **Scalability Check:** Evaluate how the change handles large datasets or increased request volume. Look for O(n^2) operations where O(n) would suffice.
- **N+1 Identification:** Actively flag ORM queries executed inside loops instead of using bulk fetches or joins.
- **Memory Management:** Check for potential memory leaks, unclosed database or network connections, and unbounded array growths.
- **I/O Efficiency:** Suggest caching layers or batching when redundant I/O bound operations are introduced.
