# Go Error Handling Code Review Standards

Errors in Go are values. Proper handling is critical to debuggability.

## 1. Do Not Swallow Errors
Errors MUST be explicitly checked immediately after the function call that returns them.
- `_` should almost never be used to ignore an error, unless the operation is explicitly fire-and-forget logging.
- **Review Action:** Reject PR if errors are returned and swallowed arbitrarily.

## 2. Error Wrapping & Context
Errors should provide traceability without losing the original root cause.
- Use `fmt.Errorf("context message: %w", err)` to wrap errors so that callers can use `errors.Is` and `errors.As`.
- Do NOT use string concatenation for errors.
- Ensure the context string is descriptive (e.g. "failed to fetch user", not just "error").

## 3. Error Matching
If a caller needs to branch logic based on an error:
- Define exported sentinel errors (e.g., `var ErrNotFound = errors.New("not found")`).
- Use `errors.Is(err, ErrNotFound)` rather than string comparisons `if err.Error() == "not found"`. String comparisons are brittle and MUST be rejected.

## 4. Handle Errors Once
An error should only be handled (e.g., logged, or returned) **once**.
- Do not log the error and then `return err` (which often causes downstream consumers to log it again, spamming logs).
- Either `return err` up the stack, or log it and degrade gracefully.

## 5. Panic
`panic` and `recover` should practically never be used in standard application business logic. Use them exclusively for truly unrecoverable boot-time initialization failures.
