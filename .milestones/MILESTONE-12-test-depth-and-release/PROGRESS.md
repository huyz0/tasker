# M12 — Progress

Delivered 2026-08-22. Ten of eleven tasks done; one deliberately not attempted
and recorded below rather than quietly dropped.

## Done

### M12-T03 — the wire format, finally exercised

Until this milestone, **nothing in the repository ever serialized a contract
message.** The GUI's tests mock the generated module; the backend's tests call
handler functions directly. A field-number collision or a type change that
broke the wire would have passed every gate green.

`packages/shared-contract/contract.roundtrip.test.ts` enumerates every request
and response *from the descriptor* — so a new service is covered the moment it
is generated, which is the only way a list like that stays true — and
round-trips each through protobuf binary, connect JSON, and both against each
other. 825 tests.

Fixtures are populated with non-default values deliberately: the default is
exactly what a broken round trip produces, so a suite built on empty messages
would pass no matter what. Two guard tests assert the fixtures are not vacuous.

### M12-T02 — the real server, over a real socket

`src/test/wire/wire.integration.test.ts` spawns `src/index.ts` as its own
process, on its own port, against its own temporary database, and drives it with
the real generated client. What that covers and nothing else does: the
interceptor chain is wired, `x-request-id` comes back on the response, the CORS
allowlist reflects one origin and refuses another, the 256 KB body cap returns
413 rather than buffering, `/healthz` and `/readyz` answer without a credential,
`/metrics` names RPCs it has actually served, and an unknown agent token is
refused by the real credential lookup rather than a fixture.

### M12-T04/T05 — the core journey

Sign in → organization → template → project → task → comment → search →
archive, every step a click a person would make.

**Determinism arrives differently than planned.** The task named a restored
database snapshot; this uses unique per-run entity names instead. That is
order-independent and repeatable against a database that already has data in it
— which is the state a developer's local backend is actually in — and it does
not destroy whatever they were in the middle of. The stricter mechanism would
have made the suite hostile to run locally, which is the fastest way to make a
suite nobody runs.

Five corrections were needed to get it green, and each one was the test learning
something true about the interface:

- The template form is behind a `+ New Template` toggle.
- Filtering a card by its heading alone matches the inner wrapper holding the
  heading and "Edit" — and no "Use Template" button at all.
- The comment composer is M23's rich editor, so its placeholder is a rendered
  paragraph rather than an attribute, and it must be typed into rather than
  filled.
- The archive confirmation says **"Move to bin"**. Matching `/delete/i` hit the
  button *behind* the dialog and left the task exactly where it was — a green
  step that proved nothing.
- The backend needs `ENABLE_TEST_LOGIN=true`, or every step fails on
  "Authentication required" three screens after the real cause.

### M12-T06 — a coverage floor

94.4% today; the gate is 80%, a ratchet against a slide rather than a stretch.

It runs its own profile rather than reading `cli:test`'s. A cached `cli:test`
writes no file, and declaring `coverage.out` as its output makes moon fail the
task outright — `go test` rewrites the profile once per package, so what
survives the run is not what moon expects to cache.

### M12-T08 — the binary is called what the documentation calls it

`rootCmd.Use` said `"cli"`, so cobra derived every usage line and error message
from a name that appears on nobody's disk. Renamed, with a test that fails if
the long help drifts back to it.

### M12-T07/T10 — releases and a changelog

GoReleaser for the Go side: three platforms, checksums, and a changelog grouped
from conventional commits with chores, docs and merges filtered out — forty
`chore(deps)` lines bury the two entries that matter. `tasker --version` reports
the tag, stamped through `main` because that is the package GoReleaser's `-X`
flags can reach. Verified by building a snapshot release and running the
artifact out of the archive.

### M12-T09 — documentation

`docs/quickstart.md` (three paths: one binary, from the repository, an agent),
plus the existing agent guide, plus `docs/cli-reference.md` — which is
**generated** from the binary's own `--help` by
`apps/cli/scripts/generate-cli-reference.sh`. A hand-written reference is a
second account of the interface, and the two drift silently, usually right
after someone adds a flag.

### M12-T11 — the final pass

`roadmap.md`'s Phase 1 and Phase 2 tables now say Delivered where that is true,
naming the milestone that closed each gap. One line is deliberately *not*
marked delivered: **invite email is still never sent** — the invite surface
exists end to end, but no SMTP integration does.

## Not done, deliberately

### M12-T01 — network-level interception in GUI tests

**Not attempted.** The task is to replace `vi.mock('…/health_pb')` with
network-level interception across 66 test files, so requests serialize as they
do in production.

What it was buying is real: nothing proved the GUI's requests survived the wire.
But that is now covered from two other directions, both of which landed in this
milestone — T03 round-trips every message through both codecs, and T02 drives
the real server with the real client over a socket. The residual gap is narrow:
whether each GUI *call site* passes the fields it thinks it does.

Against that, the change is a mechanical rewrite of 66 passing test files, each
one an opportunity to weaken an assertion while making it compile. The exit
criterion it serves — "renaming a contract field fails a GUI test" — would be
better served by a much smaller thing: a typecheck against the generated types
at the call sites, which `gui:typecheck` already does for anything not behind an
`any`.

Recorded as open rather than closed. It is a real improvement, it is not
urgent, and it should be done as its own round with room to verify each file
rather than at the end of a milestone.

### Signed binaries

The exit criterion says "signed, versioned binaries". They are versioned and
they are not signed: signing needs certificates this project does not have, and
M09 scoped code signing out for the same reason. Named here rather than left to
be discovered.

## Closed afterwards

### Invitation email (2026-08-22)

T11 recorded "invite email is never sent" as the one Phase 1 roadmap line still
open. It is now sent: Gmail by default, any provider by `SMTP_HOST`, off unless
configured, with Mailpit in `docker compose --profile mail` as a local catcher
so the feature is developable without mailing anyone. Verified against it end
to end.

The design decision worth remembering: **no accept link.** Acceptance redeems on
the identity proven at sign-in, so a forwarded invitation grants nobody
anything — a link that did would be an escalation path with no way to revoke it.

## Exit criteria

Six of eight met outright. One partially (binaries released but unsigned); one
not (the GUI mock replacement).
