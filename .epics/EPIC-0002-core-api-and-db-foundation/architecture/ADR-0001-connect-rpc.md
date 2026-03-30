# ADR 1: Adopting Connect-RPC over Standard REST
- **Date**: 2026-03-30
- **Epic**: EPIC-0002

## Context
Tasker has extremely high throughput requirements and requires a predictable, machine-readable API for the Agent CLI while providing standard human-friendly interaction capabilities. Typical RESTful APIs often lead to inconsistent JSON formats, undocumented edge cases, and unbounded payloads if not strictly enforced. Because AI Agents act on this API defensively and programmatically, any undocumented drift causes hallucinations.

## Decision
We are adopting **Connect-RPC** powered by a single **TypeSpec** contract library (`packages/shared-contract`). 

The standard compilation pipeline will output:
1. Connect-ES server bindings for the Bun backend.
2. Connect-ES client hooks for the React GUI via `@connectrpc/connect-query` + TanStack React Query.
3. Connect-Go client structs for the Cobra/Viper CLI via `connect-go`.

## Rationale
As stated in `architecture.md`, the AI Agent interface must be deterministic and structurally sound. Connect-RPC provides a lightweight method to expose standard HTTP/JSON and gRPC semantics natively. By combining it with TypeSpec, we guarantee 100% end-to-end type safety across the monorepo from the CLI binary to the React views. We chose this over native GraphQL because it supports simpler low-latency unary and bidirectional streaming operations out of the box.

## Consequences
- **Positive:** Complete end-to-end type safety; rapid Go CLI scaffolding; unambiguous boundary documentation for agents.
- **Negative:** Connect-RPC requires specific JSON-RPC envelopes not as universally debuggable via raw `curl` as bare-bones REST endpoints without configuring headers; adds a mandatory TypeSpec compilation build step before code execution.
