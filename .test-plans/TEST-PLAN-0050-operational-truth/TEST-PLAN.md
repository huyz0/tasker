# Operational truth acceptance plan

## T01 source and standards

Verify every current architecture claim against implementation paths:
local/linked identity and scoped agents; actual unary/server-streaming
contract; current authorization on replay/reconnect; transactional SQL event
and webhook capture; acknowledged relay and durable audit behavior; bounded
live resync; CLI paging/MCP/request deadlines; Radix overlays; deployment and
quality gates. Keep data-volume tests separate from staged caller evidence.

Remove obsolete unbuilt-technology claims for delivered features. Preserve
historical ADRs and genuine unscheduled gaps. Do not infer a new read store
or a healthy fleet limit from the saturated one-project write experiment.
Run unchanged Markdown/spec-drift/doc-drift gates.

## T02 roadmap and integration guidance

Reconcile M30–M58 status with milestone boxes and the ledger. Describe
transactional processing conflicts, stable-key retries after unknown outcomes,
at-least-once event/webhook identity, stream revalidation/resync and the CLI's
30-second default per-request deadline. A new schedule run is a new intent,
not a retry of an accepted occurrence. Generated CLI reference must continue
to match actual help; do not hand-edit generated output.

## T03 recovery and backup rehearsal

Exercise pending events, expired/stale leases, interrupted occurrences and
broker restart against disposable real services. Existing controlled-clock
fixtures are labeled honestly; operators must not edit clocks or live leases.

Quiesce the owned SQLite database, checkpoint/close it, copy a private backup,
remove the owned original, restore and reopen through production database
setup. For MySQL, use the existing owned service image's mysqldump/mysql
clients, private stdin/file handling and a fresh internally generated restore
schema. Track and remove only created schemas. Never upload SQL backups,
credentials or event bodies.

Assert exact restored task/source/webhook identities and continue real broker
and audit recovery against restored SQL. A deliberately empty/broken backup
must reach the restored-data checker and fail its intended identity assertion,
not merely bootstrap, transport or cleanup. Restore fixture source bytes.

Document operator prerequisites, encryption-secret preservation, coordinated
database/broker snapshots, retry/retention/dead-letter limits and safe rollback
boundaries. Final exact repository/native/browser/standalone gates and
four-lens reviews precede task closure and main publication.

## Observed recovery follow-up and real failure controls

The T03 journal records the original70-second SQLite checkpoint failure and
plans these controls before their implementation. Preserve that failure and
the observer controls that initially hit their watchdog; none counts as a
passing intended failure. Do not retroactively invent their root cause.

A real owned consumer kill must fail its original checkpoint with four source
rows/three audit rows, a settled nonzero exit, complete bounded observations,
no watchdog/cleanup failure and byte-for-byte source restoration. Observe
initial and resumed audit projectors. Track the .exited promise's settlement
rather than treating the nullable exitCode getter as a running-state flag.
The separate real signal probe records getter, signal and awaited result.

Keep consumer logs private and read bounded content; emit fixed categories,
SQL counts and broker ACK state only. Five isolated real SQLite broker
recovery commands stop at the first failure. Required MySQL8.0/8.4 runs,
real fault proofs, full repository/UI gates and final combined-head checks
remain mandatory. A green current source does not prove an unobserved cause
for the historical timeout or a permanent exactly-once/fleet guarantee.
