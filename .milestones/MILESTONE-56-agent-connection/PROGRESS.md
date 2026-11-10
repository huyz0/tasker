# M56 Agent Connection progress

## M56-T01 — Registration-to-verification design

- **Status**: done
- **Date**: 2026-11-10
- **Changed**: Define truthful registration, role guidance, scoped external configuration, exact issued-token verification and one-time secret lifetimes before implementation.
- **Verified**: M55 is published as81d2ab6 in PR #8 after final9bb70d5 passes all eight CI jobs42772975221; final/main trees match. Post-merge real integration42773867345 passes.375 done/21 pending overall.
- **Notes**: Frontend/security standards plus TDD selected. This task produces static ADR/UX/test-plan artifacts, so runtime red/green does not apply until T02/T03. Reuse existing AuthService.GetIdentity agent identity; no new API, scope, migration or hosted runtime. Current labels promise deployment, token creation retains response memory, the API base is hardcoded and the shared GUI transport includes the human cookie. Exact-token verification needs a separate credential-only transport and lifetime guards. Existing ADR0008/authorization decisions and independently researched UX guidance govern judgement; repository design skills are not treated as design evidence.
- **Next**: Record actual registration/configuration/verification alternatives, explicit role/no-token/no-role/denial/offline/loss states and account/org/agent-bound secret/async behavior. Obtain independent architecture/UX review, then static/full checks before marking design complete.

Proposed ADR0049/UX/TC001–009 now define exact-credential identity proof through
existing GetIdentity, cookie-free redirect-rejecting transport, scoped lifetime
retirement, zero inactive issuance-response retention and sanitized metadata-only
verification state. One connection section outside virtualized rows makes the
newly created agent reachable beyond loaded pages. Trusted optional deployment
API configuration unifies actual requests and safe external examples. No new RPC
or hosted process is proposed. Official GitHub token guidance, Carbon progress
semantics, MDN credentials and WCAG focus guidance are read and applied critically;
copying a snippet does not complete an observable installation stage. Existing
fonts and semantic palette remain coherent. Architecture/UX review pending.

Independent ARCH-v1/UX-v1 approve the static design with no blockers. ADR0049
is accepted. The dedicated identity request and all local lifetime/configuration
boundaries are explicit; runtime implementation remains T02/T03 and real-client
proof T04. Source preflight confirms existing token scopes must be selected
explicitly, and the current font aliases use installed system sans/monospace.
Both post-merge real integration jobs for published M55 pass. Fresh-worktree
full35 remains running before design completion.

T01 completes with accepted ADR0049/UX/TC001–009 and independent ARCH-v1/UX-v1
approvals. All35 fresh-worktree checks pass (13 cached,4m21s), including
GUI1551/95.14% branches, backend2302/zero failures/95.85% functions/96.80% lines,
contracts/CLI/standalone. The first run catches only an extra blank in STATE;
correct it, run static lint first, then full2 passes. Static design has no runtime
behavior to drive; no registration/configuration/verification feature is yet
implemented. Both post-merge integration jobs and all eight main CI jobs for
M55 now pass.

M56 is1/4 tasks complete;376 done/20 pending overall. T02 next drives truthful
registration labels, role guidance, scoped non-secret intent and one reachable
connection section through actual native-transport UI regressions before code.
No new endpoint, scope, dependency or hosted runtime is introduced.
