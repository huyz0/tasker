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

## M56-T02 — Truthful registration, roles and next-step flow

- **Status**: in-progress
- **Date**: 2026-11-10
- **Changed**: Replace deployment claims with identity registration, guide role creation and open one reachable connection section with scoped non-secret intent and native focus behavior.
- **Verified**: T01 committed/pushed as52abf71 after accepted ADR0049/UX/TC001–009, ARCH-v1/UX-v1 and all35 source/closure gates. Draft PR #9 is attached.1/4 tasks complete;20 tasks remain.
- **Notes**: Frontend/security standards and TDD selected. Reuse the existing role/agent/token APIs and UI primitives. Registration/role mutations freeze their actual scope; confirmed account/org changes retire local intent and separate cached reads. The connection section sits outside virtualized rows so a returned created identity is reachable even beyond loaded pages. Current token configuration/verification implementation remains T03.
- **Next**: Observe registration labels, role guidance/late-choice, pending cancel/scope and shared-panel/focus regressions red before the minimum implementation. Update deterministic previews, run controlled faults, actual browser and independent review/full gates.

Eleven registration/role/scope/next-step cases and two session-lifetime cases
are observed red before implementation. The screen now names registration,
labels name/role, explains external runtime and role-versus-scope meaning,
keys workspace/read caches by confirmed account/org and exposes one shared
connection section outside virtualized rows. Frozen mutation scope and local
intent revisions protect cancel/reopen, later choices and old-scope completion.

The first green attempt exposes two harness problems: an empty-state assertion
runs before its response, and mockRpc serializes Promise values rather than
awaiting deferred results. Replace deferred fixtures with the existing real
mockRpcPending helper before accepting race evidence. Correct unsupported
Testing Library role exact options and the renamed legacy error selector.
Two further actual regressions are observed red with genuine delayed replies:
old role success clears a reopened role draft, and archive closes setup onto a
soon-removed origin instead of a stable heading. Role-form generation and
archive-specific origin retirement fix both. The current native set passes49
cases (15 new registration cases plus34 existing). Add explicit later-connection
and role-writing focus cases, then controlled faults, accurate previews, browser/
independent review and full gates remain pending. Token config/verification is
still T03 work;20 tasks remain.

The no-role success path also reproduces lost keyboard focus; return to the
current registration Role control only while its creation intent still owns
focus. All74 affected agent cases pass, then CODE-v1 identifies still-editable
role fields being cleared by delayed success in the same form. The actual
pending-field regression is observed red, then those fields are frozen like
registration fields; cancel/reopen retires the old request intent.75 cases pass.

Four current-source reconciliation cases are observed red: registration leaves
activity empty, edits leave a shared connection's label/recorded activity stale,
archive leaves old activity, and an actual agent-update Connect frame refreshes
only roster data. Add bounded affected dashboard invalidations to the existing
mutations/agent event roots and derive selected names from current loaded rows.
The native set now passes98 cases, including four fresh source/stream cases,
without invalidation spies. Existing token configuration/verification remains
T03. Nineteen deterministic agent/role/registration/connection previews are now
authored; the long-name fixture is refined to a legal unbroken name rather than
only naturally wrapping hyphenated words. Type/build/rendered/fault/browser and
review amendments remain pending; T02 stays in-progress.

Actual populated previews reproduce two visual defects: a legal unbroken agent
name overflows the connection heading to2101px, and the quietest-agent footer's
Dashboard link relies on color alone. A shrinkable wrapping heading and a
persistent underline correct them. Four role previews initially fail only because
userEvent interprets literal JSON brackets as keyboard descriptors; escape the
opening bracket before accepting their rendered evidence. All19 final affected
previews now pass76 WCAG/38 mobile checks in both themes. Explicit GUI types pass.

The owned M56 backend8097/Vite5185 fixture is ready, with no shared broker or
original-service changes. Actual registration journey passes29.2s: create the
first role, preserve/name/select it, return visible keyboard focus, register an
identity, show fresh roster/activity and one connection section, switch real
theme controls, settle375/1280 layouts, then close/reopen with useful focus.
Four captures contain no issued agent secret. The first run exposes only a
Node variable omitted from a browser-evaluate argument; correct the harness
and rerun successfully. No credentials are minted by this journey.

Current source is a recoverable in-progress checkpoint:98 affected native cases,
19 rendered previews and the actual browser pass. CODE-v1's pending-field blocker
is fixed under an observed regression; amendment review, controlled faults and
full gates remain pending. T03 preflight must also reconcile the hardcoded API
default with production/custom-port worker configuration, and real-token tests
must clear secret DOM before automatic Playwright error-context snapshots as
well as disabling trace/video. These are not implemented T02 claims.
