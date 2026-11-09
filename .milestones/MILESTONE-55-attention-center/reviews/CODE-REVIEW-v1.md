# M55-T02 source review v1

- **Date**: 2026-11-09
- **Reviewer**: independent existing human_workflows_review agent, read-only
- **Decision**: changes requested
- **Scope**: backend source projection, contracts/generated clients, registration, shared prefix extraction and staged GUI coverage exception; no rendered/UI approval.

## Finding

Default pagination fails after protobuf decoding. PageRequest.limit is a
nonoptional int32; empty and cursor-only pages decode limit as zero. The new
minimum-one validator rejects them instead of using the documented default20.
Normalize omitted/zero limits, cover actual decoded/HTTP pages, keep negative
limits rejected and max100.

## Other lenses

Source eligibility, current active-parent/tenant authority, scoped actor
hydration, SQL limits, shared literal prefix reuse, additive contracts and actual
service registration match accepted ADR0048 and UX. Full gates and real MySQL
proof remain required. No additional architecture, security, product-flow or
maintainability blocker was found in this source pass.
