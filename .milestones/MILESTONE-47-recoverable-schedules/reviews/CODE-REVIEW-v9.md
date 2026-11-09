---
timestamp: 2026-11-09T12:05:00Z
decision: approved
---

# M47 final acceptance

Correctness: durable admission/advance and frozen work/receipt/event units,
fenced takeover/current authority, manual/overlap/control semantics and locked
project/org retention cleanup match ADR-0041. Independent reliability v8 and
restore re-review approve; deliberate unit/fence/uniqueness/context faults fail.

Coverage: both-dialect actual process/upgrade matrix passes3 tests/153 assertions;
restored SQLite purge/process passes6/92. Four actual browser journeys pass,
including real source reads and dark editor axe. Full35 local gates pass;
backend2175/zero failures, GUI1360/95.34% branches, CLI gate93.8%. Prior173-story
axe/375px checks and four added-alert theme/viewport checks pass; full final-head
CI still gates publication.

Architecture: private frozen workflow core, one scoped stream plus bounded
source polling, retained receipt ownership and compatible fields remain inside
the approved boundaries. No hosted executor or external execution claim.

Security: original actor/current credential checks, current authorized history,
tenant event scope, private metadata exclusion and purge serialization receive
independent approval. Operating/discovery help and generated reference match.

```yaml
findings: []
```
