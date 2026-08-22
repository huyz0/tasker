# Proactive Alerting for Stalled Claims — Plan

## Task 1 (this document) — Save the design record

Write this spec folder (`shape.md`, `references.md`, `plan.md`,
`standards.md`), one ADR (`ADR-0022` in `.specs/adr/`), and the formal
milestone spec — the `MILESTONE.md` and `PROGRESS.md` under
`.milestones/MILESTONE-25-stalled-claim-alerting/`. No product code
changes in this task.

## Tasks 2 onward — tracked in `MILESTONE-25`, not duplicated here

Per `milestone-standard.md`, `MILESTONE.md`'s Task Breakdown (stable
`M25-T<NN>` ids, `Files:`, `Verify:` per task) is the single source of
truth. Summary, for orientation:

- **M25-T02** — `stalled_claim_alerts` schema (both dialects, NOT NULL
  `anchor_at`), migrations, embedded-migrations regen, purge-cascade
  integration.
- **M25-T03** — Extract `findStalledCandidates` into `lib/` (dialect-
  branched, global-scale-safe), rewire `reports/exceptions.ts` onto it
  with unchanged behavior.
- **M25-T04** — Recipient resolution, digest email template, the sweep
  itself, `STALLED_ALERT_AFTER_HOURS`, `setInterval` wiring, the domain
  event.
- **M25-T05** — Real Mailpit verification, docs, full suite, closeout.

Each executes one at a time, one commit per task, TDD-first, with a
review pass before each commit and `moon check --all` clean throughout.

## Where the design lives

The final design and its rationale are in `shape.md` and `ADR-0022`; the
review that corrected the draft into that final design is in
`references.md` — one place authoritative per decision, not restated here.
