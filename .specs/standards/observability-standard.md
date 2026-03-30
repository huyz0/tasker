# Observability & Error Handling Standards

This document defines the strict requirements for system telemetry, logging, and error management across all environments. Maintaining robust observability is critical to diagnosing failures and ensuring project stability without relying strictly on terminal outputs.

## 1. Structured Logging
- **The Format**: All application logs must be serialized as structured JSON payloads. This guarantees parsing mechanisms, such as ELK stack or Datadog, can index and query fields correctly.
- **Console.log Deprecation**: Explicitly prohibit the usage of raw `console.log()` across backend services. Exclusively utilize our centralized logger utility (e.g., using Pino or Winston).
- **Mandatory Context**: A structured log must reliably include context strings, such as timestamps (`@timestamp`), logging severity (`level`), current process ID (`pid`), and contextual trace tokens (see below).

## 2. Distributed Tracing & Correlation
- **Trace Context Passing**: Provide a unified correlation ID across disparate microservices, background jobs, and concurrent HTTP paths. For HTTP, require propagation of the standard `x-request-id` header or preferably OpenTelemetry Trace Context (`traceparent`).
- **Log Binding**: Every log output must automatically append the user’s `userId` (if authenticated) and the contextual `traceId` / `correlationId` associated with the execution thread.

## 3. Standardized Error Handling
- **Wrapping and Contextualizing**: Do not discard the root cause of an internal error by throwing generic string exceptions (`throw new Error("Failed")`). Wrap exceptions maintaining the stack chain, appending domain-specific meta-data exactly as required by the business logic execution flow.
- **HTTP Problem Details shape**: System-wide error responses mapping to an external client UI *must not leak internal stack traces*.
  Serialize errors adhering directly to standards (similar to RFC 7807) to inform clients comprehensively.
  ```json
  {
    "error": {
      "type": "https://example.com/probs/insufficient-funds",
      "title": "Insufficient Funds",
      "status": 403,
      "detail": "Your current balance is 10, but that costs 50."
    }
  }
  ```
- **Global Catch-All**: The topmost boundary (API Route or Serverless Function wrapper) must act as a global catch-all. All unhandled promises or uncaught runtime sync exceptions will be intercepted here, immediately shipped as a discrete FATAL log event, and returned to the caller cleanly formatted as a generalized `500 Server Error`.

## 4. Telemetry Events (Metrics)
- **Monitoring Anomalies**: Emitting explicit metric occurrences for significant business transactions (e.g., `user.created`, `checkout.completed`) is required for real-time alerting.
- **Custom Metric Tagging**: Utilize explicit Key/Value tag mappings when emitting Counter / Gauge / Histogram metrics so data structures support multidimensional analysis dashboards (e.g., `status: success`, `region: eu-west`).
