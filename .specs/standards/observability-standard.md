# Observability Standards

## 1. Structured Logging

- **Format**: All logs MUST output as JSON payloads for parsing.
- **Deprecation**: Never use raw `console.log()`. Use centralized logger
  instance (Pino/Winston).
- **Context Required**: Inject `@timestamp`, `level`, `pid`, and telemetry trace
  tokens globally.

## 2. Tracing & Correlation

- **Propagation**: Propagate correlation IDs across all boundaries. Use
  `traceparent` (OpenTelemetry) or `x-request-id` headers.
- **Log Binding**: Auto-append authenticated `userId` and thread `traceId`
  per-request context via binding.

## 3. Errors

- **Wrapping**: Do not discard root cause stacks (`throw new Error("Failed")`).
  Wrap exceptions and inject domain meta-data.
- **HTTP Problem Details**: Format user-facing API errors identically to RFC
  7807 problem details inside `.error`. Never leak internal stacks.
- **Global Catch-All**: API route wrappers must intercept unhandled promises,
  log FATAL trace, and cleanly return `500 Server Error`.

## 4. Telemetry Events

- **Metrics**: Emit structural metrics for critical business events
  (`user.created`).
- **Tagging**: Tag dimensional telemetry counters explicitly (e.g.,
  `status: success`).
