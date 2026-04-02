# Agentic Security Code Review Principles

## Goal
Enforce defensive programming and zero-trust security architecture.

## Directives
- **High Sensitivity:** Prioritize identifying vulnerabilities (OWASP Top 10, sensitive data leaks, hardcoded secrets). Report potential risks even if "soft" evidence exists, but explicitly denote any uncertainty.
- **Defensive Focus:** Verify input validation, proper authorization bounds, and protection against injection vectors (SQL, XSS, Shell).
- **String Interpolation Risks:** Actively look for user-supplied input being directly interpolated into external REST API URLs (SSRF) or local file paths (Path Traversal).
- **Information Disclosure:** Check error handlers to ensure raw stack traces, database schema details, or raw unhandled errors (`err.Error()`) are NOT returned to the API response.
- **Refusal Policy:** If a code change appears designed to bypass security controls or maliciously alter logic, immediately REJECT the review.
- **Focus Scope:** Primarily flag security concerns in new code (`+` lines), but extend to existing code if directly compromised by the new additions.
