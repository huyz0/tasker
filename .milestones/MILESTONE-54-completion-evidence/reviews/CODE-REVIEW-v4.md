---
timestamp: 2026-11-09T22:18:15Z
decision: approved
---

# T04 evidence surface and access/control lifetime

Independent human-workflow source review initially rejects two UI control-state
gaps: automatic invalidation after known read denial and premature write-control
restoration on Refresh. Both have observed failing regressions and are corrected.
A second review rejects canceled-refetch cached success as authorization proof;
its failing regression now requires accepted-response counter advancement before
write-denial reset. Final independent review approves with no remaining source
or rendered UX blockers, explicitly pending full35 gate completion.

Correctness: one Evidence section follows Summary outside its disclosure and
precedes Agent plan; task-sidebar duplication is removed and reverse Tasks
remain. Paged metadata retains loaded extent, retries page failures, uses fresh
cursor chains and reads no bodies/owners. Guarded read acceptance settles before
children become actionable, preventing a queued effect from re-enabling after a
quick next-page failure. Current query/account/org/task keys and abort signals
fence old search and late mutation intent; global pending writes fence reopening.

Coverage:37 focused GUI cases pass, two live browser journeys pass, real MySQL
passes70 assertions, and old clients pass18 decodes with442 messages/1241 fields
preserved. Six restored GUI faults fail.37 GUI cases include initial and later
errors, known-denial→offline→remount recovery, global invalidation, write-denial
refresh/cancellation, page extent, debounce, foreign late write, pending reopening,
visible/focus/reconnect/unmount and account transitions. Full coverage remains a
completion gate; this review does not assert its pending result.

Architecture: optional paged capability fields4/5 use existing policy, without
client role reconstruction or new permissions/RPCs. One bounded metadata selector
serves task/reverse links. Recorded PR signals reuse the existing workbench
project read, filter exact task IDs and introduce no additional provider lookup.
Its existing unbounded project selector remains an M49 scale concern; no task
build correlation or provider freshness/completeness claim is made.

Security: source metadata remains current-read authorized; unavailable names are
sanitized, denied cache stays hidden until explicit successful retry, and write
controls remain advisory under independent server checks. Unknown capabilities
stay unknown. Agent unlink stays refused. Canonical artifact links carry org only
and resolve actual ownership. Provider links accept only HTTP(S). Tokens/secrets
are absent from captured fixtures and previews.

```yaml
findings: []
```
