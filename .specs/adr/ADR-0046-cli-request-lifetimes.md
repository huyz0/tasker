---
id: ADR-0046
status: accepted
date: 2026-11-09
milestone: M48
---

# CLI deadlines belong to individual requests

## Context

Most CLI RPCs use context.Background and http.DefaultClient without a timeout.
A backend that accepts a connection and never answers can hang an agent's
command indefinitely. The command must also respond to process cancellation.
MCP stdio is intentionally long-lived, while each HTTP exchange is finite.

## Options

1. Put a deadline on the entire command context. This also times human password
   entry, whole paginated traversals and idle MCP stdio sessions, which are not
   individual backend request lifetimes.
2. Set a global HTTP-client timeout. This bounds requests but can cut off a
   streaming connection and does not connect command cancellation to calls
   issued with context.Background.
3. Give every unary call a deadline while inheriting its command context. Use
   a Connect unary interceptor and the same bounded context helper around plain
   HTTP exchanges; retain a cancellation-only command/process context.

## Decision

Use option 3 with `--timeout`, a positive duration defaulting to 30 seconds.
Each unary RPC, auth/debug HTTP request and MCP HTTP exchange gets a child
deadline. An earlier parent deadline wins; parent cancellation propagates.
Pagination gets a new per-request budget on each page. No automatic mutation
retry is added, and a timeout is not proof a remote mutation did not commit.

Pass Cobra's command context through all production request paths. The real
entry point handles interrupt/termination with a signal context. Repeated
in-process command execution resets inherited contexts so a previous cancelled
invocation cannot poison the next. Timeout errors retain the existing retryable
exit classification (7); cancellation uses conventional exit 130. Errors still
print once on stderr, with no request results on stdout after failure.

The entry point allows a short bounded drain after cancellation, then exits
even if an interactive read does not cooperate. Snapshot and explicitly restore
the terminal state before exit: a masked password reader's deferred echo restore
does not run if process exit interrupts that reader. Completed pages or local
diagnostics may already have produced output before a later request fails.

MCP stdio retains its cancellation-only session context. Each message uses a
separate bounded HTTP child context and a timeout produces a JSON-RPC error for
that message's ID. The relay can accept a later request. Cancellation interrupts
an active HTTP request and closes an owned closable input to unblock an idle
scanner; no timeout is placed on the whole MCP session or on stdin inactivity.

## Consequences

- Existing callers gain a finite default and can choose a larger positive
  duration. Disabling request bounds with zero/negative values is rejected.
- Existing generated clients/contracts are unchanged; no new dependency is
  required. Unary interception does not add a deadline to a future stream.
- Parent cancellation remains effective even with a long configured timeout.
  Interactive input and whole multi-page operations have no arbitrary overall
  deadline, while each network request remains bounded.
- A cancelled network request may already have committed at the server. Existing
  operation keys remain the way to retry safely; this change does not promise
  cancellation of committed work or a hosted executor.
