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
